import { performance } from "perf_hooks";
import { createDeferred } from "../src/deferred";
import { Config, JobDispatcher, Status } from "../src/zuteil";

const spies = {
    statusListener: (status: Status) => status
};

const setupDispatcherWithSpy = (config?: Config) => {
    spyOn(spies, "statusListener").and.callThrough();
    const dispatcher = new JobDispatcher(config);
    dispatcher.attachListener(spies.statusListener);
    return dispatcher;
};

describe("Global Dispatcher", () => {
    it("calling getInstance should create and return the same instance everytime.", () => {
        const dispatcher1 = JobDispatcher.getInstance();
        const dispatcher2 = JobDispatcher.getInstance();
        expect(dispatcher1).toBe(dispatcher2);
    });
});

describe("Test StatusListener", () => {
    const deferred = createDeferred<void>();
    const deferred2 = createDeferred<void>();
    let dispatcher: JobDispatcher;
    let job: Promise<void | null>;
    let job2: Promise<void | null>;

    beforeAll(() => {
        dispatcher = setupDispatcherWithSpy();
        job = dispatcher.addJob(() => deferred);
    });

    it("adding a job should notify", () => {
        expect(spies.statusListener).toBeCalledTimes(1);
        expect(spies.statusListener).lastCalledWith({
            running: 0,
            failed: 0,
            pending: 1,
            succeeded: 0,
            timedOut: 0,
            total: 1
        });
    });

    it("starting a job should notify", () => {
        dispatcher.start();
        expect(spies.statusListener).toBeCalledTimes(2);
        expect(spies.statusListener).lastCalledWith({
            running: 1,
            failed: 0,
            pending: 0,
            succeeded: 0,
            timedOut: 0,
            total: 1
        });
    });

    it("finishing a job should notify", async () => {
        deferred.resolve(); // finish job and wait for dispatcher to finish as well
        await job;

        expect(spies.statusListener).toBeCalledTimes(3);
        expect(spies.statusListener).lastCalledWith({
            running: 0,
            failed: 0,
            pending: 0,
            succeeded: 1,
            timedOut: 0,
            total: 1
        });
    });

    it("adding another job when dispatcher is not paused should only notify once", () => {
        job2 = dispatcher.addJob(() => deferred2);

        expect(spies.statusListener).toBeCalledTimes(4);
        expect(spies.statusListener).lastCalledWith({
            running: 1,
            failed: 0,
            pending: 0,
            succeeded: 1,
            timedOut: 0,
            total: 2
        });
    });

    it("failing job should not throw and notify instead", async () => {
        deferred2.reject();
        await job2;

        expect(spies.statusListener).toBeCalledTimes(5);
        expect(spies.statusListener).lastCalledWith({
            running: 0,
            failed: 1,
            pending: 0,
            succeeded: 1,
            timedOut: 0,
            total: 2
        });
    });

    it("detaching a listener should stop it from being notified", async () => {
        dispatcher.detachListener(spies.statusListener);
        await dispatcher.addJob(() => deferred); // job is immediately done since promise is already resolved (would normally notify twice as seen below)

        expect(spies.statusListener).toBeCalledTimes(5); // <- same as in the test before

        // make sure the job was actually excuted by executing another one, this time listening for changes (wtf, who has time for this?)
        dispatcher.attachListener(spies.statusListener);
        await dispatcher.addJob(() => deferred);

        expect(spies.statusListener).toBeCalledTimes(7);  // has been notified once for adding and finishing the job
        expect(spies.statusListener).lastCalledWith({
            running: 0,
            failed: 1,
            pending: 0,
            succeeded: 3, // <- should have increased by two
            timedOut: 0,
            total: 4 // <- should have increased by two
        });
    });
});

describe("Test configuration options", () => {

    it("A dispatcher created with `{ startImmediate: true }` should immediately start executing jobs", async () => {
        const dispatcher = setupDispatcherWithSpy({ startImmediate: true });
        await dispatcher.addJob(() => Promise.resolve("success"));

        expect(spies.statusListener).toHaveBeenLastCalledWith({
            running: 0,
            failed: 0,
            pending: 0,
            succeeded: 1,
            timedOut: 0,
            total: 1
        });
    });

    it("timeout should work", async () => {
        // Jest Timeout for a slow test is 5 seconds, so let's don't overdo it
        const dispatcher = setupDispatcherWithSpy({ timeout: 100, startImmediate: true });
        const job1 = await dispatcher.addJob(() => new Promise(r => setTimeout(() => r("success"), 50)));  // should pass

        const time1 = performance.now();
        const job2 = await dispatcher.addJob(() => new Promise(r => setTimeout(r, 150))); // should time out
        const time2 = performance.now();

        expect(job1).toEqual("success");
        expect(job2).toBeNull();
        expect(spies.statusListener).lastCalledWith({
            running: 0,
            failed: 0,
            pending: 0,
            succeeded: 1,
            timedOut: 1,
            total: 2
        });

        // job should take around .1s before timeout
        expect((time2 - time1) / 1000).toBeCloseTo(0.1, 1);
    });

    it("retry should work", async () => {
        const dispatcher = setupDispatcherWithSpy({ maxAttempts: 5, startImmediate: true });

        let job1Attemps = 0;
        const job1 = dispatcher.addJob(async () => {
            job1Attemps++;
            if (job1Attemps < 3) {
                throw new Error("fail");
            }
            return "success";
        });

        let job2Attemps = 0;
        const job2 = dispatcher.addJob(async () => {
            job2Attemps++;
            if (job2Attemps < 6) {
                throw new Error("fail");
            }
            return "success";
        });

        expect(await job1).toEqual("success");
        expect(job1Attemps).toBe(3);
        expect(await job2).toBeNull();
        expect(job2Attemps).toBe(5);
    });

    describe("concurrent jobs should speed up things", () => {
        it("run 5 100ms jobs in sequence, should take 500-550ms", async () => {
            const dispatcher = setupDispatcherWithSpy({ concurrentLimit: 1 });

            const jobs = new Array(5).fill(null).map(() =>
                dispatcher.addJob(() => new Promise<void>(r => setTimeout(r, 100))));

            const time1 = performance.now();
            dispatcher.start();
            await Promise.all(jobs);
            const time2 = performance.now();

            // should take between 500 and 600 ms
            expect(time2 - time1).toBeGreaterThan(500);
            expect(time2 - time1).toBeLessThan(550);
        });

        it("run 5 100ms jobs in parallel, should take 100-120ms", async () => {
            const dispatcher = setupDispatcherWithSpy({ concurrentLimit: 5 });

            const jobs = new Array(5).fill(null).map(() =>
                dispatcher.addJob(() => new Promise<void>(r => setTimeout(r, 100))));

            const time1 = performance.now();
            dispatcher.start();
            await Promise.all(jobs);
            const time2 = performance.now();

            // should take between 500 and 600 ms
            expect(time2 - time1).toBeGreaterThan(100);
            expect(time2 - time1).toBeLessThan(120);
        });

    });
});

describe("Test stop functionality", () => {
    it("running jobs should be completed but no newly added or pending started again", async () => {
        const dispatcher = setupDispatcherWithSpy({ startImmediate: true, concurrentLimit: 1 });
        const deferred = createDeferred<void>();
        const job = dispatcher.addJob(() => deferred);
        dispatcher.addJob(() => Promise.resolve(2));
        dispatcher.stop();

        expect(spies.statusListener).toHaveBeenLastCalledWith({
            running: 1,
            failed: 0,
            pending: 1,
            succeeded: 0,
            timedOut: 0,
            total: 2
        });

        dispatcher.addJob(() => Promise.resolve(3));
        deferred.resolve();
        await job;

        expect(spies.statusListener).toHaveBeenLastCalledWith({
            running: 0,
            failed: 0,
            pending: 2,
            succeeded: 1,
            timedOut: 0,
            total: 3
        });
    });

    it("param 'cancelRunningJobs': running jobs should be cancelled and pending again with priority", async () => {
        const dispatcher = setupDispatcherWithSpy({ startImmediate: true, concurrentLimit: 1 });
        const deferred = createDeferred<void>();

        let orderFinished = 1;

        const job1 = dispatcher.addJob(async () => {
            await deferred;
            return orderFinished++;
        });
        const job2 = dispatcher.addJob(() => Promise.resolve(orderFinished++));

        expect(spies.statusListener).toHaveBeenLastCalledWith({
            running: 1,
            failed: 0,
            pending: 1,
            succeeded: 0,
            timedOut: 0,
            total: 2
        });

        await dispatcher.stop(true);

        expect(spies.statusListener).toHaveBeenLastCalledWith({
            running: 0,
            failed: 0,
            pending: 2,
            succeeded: 0,
            timedOut: 0,
            total: 2
        });

        dispatcher.start();
        deferred.resolve();

        expect(await job1).toBe(2); // <-- the cancelled instance of job1 will still run when deferred is resolved, thereby increasing orderFinished to 2
        expect(await job2).toBe(3);

        expect(spies.statusListener).toHaveBeenLastCalledWith({
            running: 0,
            failed: 0,
            pending: 0,
            succeeded: 2,
            timedOut: 0,
            total: 2
        });
    });
});

describe("Test add functionality", () => {
    it("test priority of tasks", async () => {
        const dispatcher = setupDispatcherWithSpy({ concurrentLimit: 1 });

        let orderFinished = 1;
        const job1 = dispatcher.addJob(() => Promise.resolve(orderFinished++));

        // job2 will be prepended and should finish first
        const job2 = dispatcher.addJob(() => Promise.resolve(orderFinished++), true);

        dispatcher.start();
        expect(await job1).toBe(2);
        expect(await job2).toBe(1);
    });

    it("test ignoreJobLimit param", async () => {
        const dispatcher = setupDispatcherWithSpy({ concurrentLimit: 1 });
        const deferred = createDeferred<void>();

        let orderFinished = 1;
        const job1 = dispatcher.addJob(() => Promise.resolve(orderFinished++));

        // job2 will be prepended and should finish before job1
        const job2 = dispatcher.addJob(async () => {
            await deferred;
            return orderFinished++;
        }, true);

        dispatcher.start();

        // job3 will also be prepended. Since job2 is already running now, it should come in second,
        // but because it ignores the concurrency limit, and job2 is waiting on deferred, job3 should therefore finish first
        const job3 = dispatcher.addJob(() => Promise.resolve(orderFinished++), true, true);

        await job3;
        deferred.resolve();

        expect(await job1).toBe(3);
        expect(await job2).toBe(2);
        expect(await job3).toBe(1);
    });
});
