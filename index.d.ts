declare module "deferred" {
    /**
     * `Deferred<T>` is a Promise with exposed resolve and reject methods.
     *
     * Useful for passing around in your program and resolving from any outside scope.
     *
     * Create new deferred promises with `createDeferred<T>()`
     */
    export interface Deferred<T> extends Promise<T> {
        resolve: (value: T | Promise<T>) => void;
        reject: (reason?: any) => void;
    }
    export function createDeferred<T>(): Deferred<T>;
}
declare module "zuteil" {
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
    export class JobDispatcher {
        private stack;
        private static instance;
        private config;
        private cancelJobs;
        private status;
        private listeners;
        /** Will return a global job dispatcher.
         *
         * If you need (multiple) local dispatchers, use the constructor instead.
         */
        static getInstance(config?: Config): JobDispatcher;
        /** Creates a new Job Dispatcher.
         *
         * If you need a global dispatcher, use `getInstance()` instead.
         */
        constructor(config?: Config);
        /** starts the excution of jobs. */
        start(): void;
        /** stops the excution of jobs.
         *
         * @param cancelRunningJobs If true, any running job will be cancelled and added to the pending jobs again,
         *  getting priority over other already pending jobs.
         *
         *  __Note:__ Cancelled jobs may still be running and cause side effects they are just ignored by the dispatcher!
         *
         * _This function is async and will return either immediately or once all running tasks are cancelled_
         */
        stop(cancelRunningJobs?: boolean): Promise<void>;
        /** Adds the job to the queue and returns a promise that resolves once the job is done or has failed.
         *  The returned promise will always resolve. If the job fails, the promise will resolve with `null`.
         *
         * @param immediate If true, the added job will be the first to be executed next. Otherwise jobs get executed in the order they are added.
         * @param ignoreJobLimit If true, the added job will be immediatly executed, even if the maximum amount of concurrent jobs is thereby exceeded.
         * (_Does only hold if the execution is enabled at all, don't forget to call `start()`_)
         */
        addJob<T>(job: Job<T>, immediate?: boolean, ignoreJobLimit?: boolean): Promise<T | null>;
        /** Adds a listener which gets notified on status updates.
         *
         * Returns a function with which the listener can be detached.
         */
        attachListener(listener: StatusListener): () => void;
        /** Removes a listener if it is known. */
        detachListener(listener: StatusListener): void;
        private executeJob;
        private onJobComplete;
        private notifyListeners;
        private update;
    }
}
