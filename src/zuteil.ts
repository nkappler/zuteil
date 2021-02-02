import { createDeferred, Deferred } from "./deferred";
import type { Config, Job, Status, StatusListener } from "./types";

enum FAILURE {
    TIMEOUT = "TIMEOUT",
    ERROR = "ERROR",
}

export class JobDispatcher {
    private stack: Deferred<void>[] = [];
    private static instance: JobDispatcher | null = null;
    private config: Required<Config>;
    private status: Status = {
        running: 0,
        failed: 0,
        pending: 0,
        succeeded: 0,
        timedOut: 0,
        total: 0
    };
    private listeners: StatusListener[] = [];

    /** Will return a global job dispatcher.
     *
     * If you need (multiple) local dispatchers, use the constructor instead.
     */
    public static getInstance(config?: Config) {
        if (!this.instance) {
            this.instance = new JobDispatcher(config);
        }
        return this.instance;
    }

    /** Creates a new Job Dispatcher.
     *
     * If you need a global dispatcher, use `getInstance()` instead.
     */
    public constructor(config?: Config) {
        this.config = {
            maxRunning: Infinity,
            maxAttempts: 1,
            startImmediate: false,
            stopWhenDone: false,
            timeout: -1,
            ...config
        };
    }

    /** Adds the job to the queue and returns a promise that resolves once the job is done or has failed.
     *  The returned promise will always resolve. If the job fails, the promise will resolve with `null`.
     *
     * @param immediate If true, the added job will be the first to be executed next. Otherwise jobs get executed in the order they are added.
     */
    public async addJob<T>(job: Job<T>, immediate = false): Promise<T | null> {
        this.status.total++;
        this.status.pending++;
        this.notifyListeners();

        const deferred = createDeferred<void>();
        immediate
            ? this.stack.unshift(deferred)
            : this.stack.push(deferred);

        if (this.config.startImmediate) {
            this.update();
        }

        await deferred;
        const finalResult = this.executeJob(job);
        return finalResult;
    }

    /** Add a listener which gets notified on status updates.
     *
     * Returns a function with which the listener can be detached.
     */
    public attachListener(listener: StatusListener) {
        if (!this.listeners.includes(listener)) {
            this.listeners.push(listener);
        }
        return () => this.detachListener(listener);
    }

    /** Detaches a listener if it is known */
    public detachListener(listener: StatusListener) {
        this.listeners = this.listeners.filter(l => l !== listener);
    }

    private async executeJob<T>(job: Job<T>) {
        type PossibleFailure = T | FAILURE | null;
        const isUnsuccessful = (result: PossibleFailure) => {
            const failedResults: PossibleFailure[] = [
                FAILURE.ERROR,
                FAILURE.TIMEOUT
            ];

            return failedResults.includes(result);
        };

        let jobresult: PossibleFailure = null;
        let attempt = 0;
        while (attempt === 0 || isUnsuccessful(jobresult) && attempt < this.config.maxAttempts) {
            attempt++;
            const timeout = this.config.timeout >= 0
                ? new Promise<FAILURE>(r => setTimeout(() => r(FAILURE.TIMEOUT), this.config.timeout))
                : new Promise<FAILURE>(() => { /** never time out */ });
            const result = job().catch(() => FAILURE.ERROR);
            jobresult = await Promise.race([timeout, result]);
        }

        return this.onJobComplete(jobresult);
    }

    private onJobComplete<T>(jobresult: T | FAILURE | null) {
        let finalResult: T | null = null;

        this.status.running--;
        if (jobresult === FAILURE.ERROR) {
            this.status.failed++;
        } else if (jobresult === FAILURE.TIMEOUT) {
            this.status.timedOut++;
        } else {
            this.status.succeeded++;
            finalResult = jobresult;
        }

        this.update(); // start next job once complete
        return finalResult;
    }

    private notifyListeners() {
        this.listeners.forEach(l => l(this.status));
    }

    private update() {
        if (this.stack.length > 0 && this.status.running <= this.config.maxRunning) {
            this.status.running++;
            this.status.pending--;
            // setTimeout(() => {
            const waiter = this.stack.shift();
            waiter?.resolve();
            // });
        }
        this.notifyListeners();
    }

}
