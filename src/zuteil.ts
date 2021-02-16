/*! zuteil | (c) Nikolaj Kappler | https://github.com/nkappler/zuteil/blob/main/LICENSE !*/

import { createDeferred, Deferred } from "./deferred";

export type Job<T> = (...args: any[]) => Promise<T>;

export interface Config {
    /** if specified, any running job will fail after the specified timeout (in milliseconds). */
    timeout?: number;
    /** if specified, any failed job will be retried up to X times before being rejected.
     *
     * Default `1`.
     */
    maxAttempts?: number;
    /** the maximum amount of jobs being run at once.
     *
     * Default: `Infinity`.
     */
    concurrentLimit?: number;
    /** whether newly added jobs should be run immediately if possible.
     * If set to false, you need to start execution by calling `start()`.
     *
     * Default `false`.
     */
    startImmediate?: boolean;
    /** when set to true, execution is stopped once the last job is done. Jobs added afterwards won't
     * be executed until `start()` is called again.
     *
     * Default `false`.
     */
    stopWhenDone?: boolean;
}

export interface Status {
    total: number;
    succeeded: number;
    failed: number;
    timedOut: number;
    pending: number;
    running: number;
}

export type StatusListener = (status: Status) => void;

enum FAILURE {
    TIMEOUT = "TIMEOUT",
    ERROR = "ERROR",
    CANCELLED = "CANCELLED",
}

interface ExcludedConfigProps {
    startImmediate: boolean;
}
interface AddedConfigProps {
    isPaused: boolean;
}

export class JobDispatcher {
    private stack: Deferred<void>[] = [];
    private static instance: JobDispatcher | null = null;
    private config: Omit<Required<Config>, keyof ExcludedConfigProps> & AddedConfigProps;
    private cancelJobs = createDeferred<FAILURE.CANCELLED>();
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
    public constructor(config: Config = {}) {
        this.config = {
            concurrentLimit: Infinity,
            maxAttempts: 1,
            isPaused: config.startImmediate !== undefined ? !config.startImmediate : true,
            stopWhenDone: false,
            timeout: -1,
            ...config
        };
    }

    /** starts the excution of jobs. */
    public start() {
        this.config.isPaused = false;
        this.cancelJobs = createDeferred();
        this.update();
    }

    /** stops the excution of jobs.
     *
     * @param cancelRunningJobs If true, any running job will be cancelled and added to the pending jobs again,
     *  getting priority over other already pending jobs.
     *
     *  __Note:__ Cancelled jobs may still be running and cause side effects they are just ignored by the dispatcher!
     *
     * _This function is async and will return either immediately or once all running tasks are cancelled_
     */
    public async stop(cancelRunningJobs = false) {
        this.config.isPaused = true;
        if (cancelRunningJobs) {
            this.cancelJobs.resolve(FAILURE.CANCELLED);
            // allow microtasks to finish before returning, thereby allowing all calls to update() to pass;
            await new Promise<void>(r => setTimeout(r));
        }
    }

    /** Adds the job to the queue and returns a promise that resolves once the job is done or has failed.
     *  The returned promise will always resolve. If the job fails, the promise will resolve with `null`.
     *
     * @param immediate If true, the added job will be the first to be executed next. Otherwise jobs get executed in the order they are added.
     * @param ignoreJobLimit If true, the added job will be immediatly executed, even if the maximum amount of concurrent jobs is thereby exceeded.
     * (_Does only hold if the execution is enabled at all, don't forget to call `start()`_)
     */
    public async addJob<T>(job: Job<T>, immediate = false, ignoreJobLimit = false): Promise<T | null> {
        this.status.total++;
        this.status.pending++;

        const deferred = createDeferred<void>();
        immediate
            ? this.stack.unshift(deferred)
            : this.stack.push(deferred);

        this.update(ignoreJobLimit);

        await deferred;
        return this.executeJob(job);
    }

    /** Adds a listener which gets notified on status updates.
     *
     * Returns a function with which the listener can be detached.
     */
    public attachListener(listener: StatusListener) {
        if (!this.listeners.includes(listener)) {
            this.listeners.push(listener);
        }
        return () => this.detachListener(listener);
    }

    /** Removes a listener if it is known. */
    public detachListener(listener: StatusListener) {
        this.listeners = this.listeners.filter(l => l !== listener);
    }

    private async executeJob<T>(job: Job<T>) {
        type PossibleFailure = T | FAILURE | null;
        const isUnsuccessful = (result: PossibleFailure) => {
            const failedResults: PossibleFailure[] = [
                FAILURE.ERROR,
                FAILURE.TIMEOUT
                // if cancelled we don't need to try again
            ];

            return failedResults.includes(result);
        };

        let jobresult: PossibleFailure = null;
        let attempt = 1;
        while (attempt === 1 || isUnsuccessful(jobresult) && attempt <= this.config.maxAttempts) {
            attempt++;
            const timeout = this.config.timeout >= 0
                ? new Promise<FAILURE>(r => setTimeout(() => r(FAILURE.TIMEOUT), this.config.timeout))
                : new Promise<FAILURE>(() => { /** never time out */ });
            const result = job().catch(() => FAILURE.ERROR);
            jobresult = await Promise.race([timeout, result, this.cancelJobs]);
        }

        return this.onJobComplete(job, jobresult);
    }

    private async onJobComplete<T>(job: Job<T>, jobresult: T | FAILURE | null) {
        let finalResult: T | null | Promise<T | null> = null;

        this.status.running--;
        if (jobresult === FAILURE.ERROR) {
            this.status.failed++;
        } else if (jobresult === FAILURE.TIMEOUT) {
            this.status.timedOut++;
        } else if (jobresult === FAILURE.CANCELLED) {
            this.status.total--; // don't increase job count by adding it again
            finalResult = this.addJob(job, true);
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

    private update(ignoreJobLimit = false) {
        while (!this.config.isPaused
            && this.stack.length > 0
            && (this.status.running < this.config.concurrentLimit || ignoreJobLimit)) {

            ignoreJobLimit = false; // this must be reset to false, otherwise the limit will be ignored for all pending jobs!
            this.status.running++;
            this.status.pending--;
            const waiter = this.stack.shift();
            waiter!.resolve(); // stack.length > 0 !
        }
        this.notifyListeners();
    }

}
