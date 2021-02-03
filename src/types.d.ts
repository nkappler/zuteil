export type Job<T> = (...args: any[]) => Promise<T>;

export interface Config {
    /** if specified, any running job will fail after the specified timeout (in milliseconds). */
    timeout?: number;
    /** if specified, any failed job will be retried up to X times before being rejected. Default `1`*/
    maxAttempts?: number;
    /** the maximum amount of jobs being run at once.
     * 
     * Default: `Infinity`. */
    concurrentLimit?: number;
    /** whether newly added jobs should be run immediately if possible.
     * If set to false, you need to start execution by calling `start()`.
     * 
     * Default `false`. */
    startImmediate?: boolean;
    /** when set to true, execution is stopped once the last job is done. Jobs added afterwards won't
     * be executed until `start()` is called again.
     * 
     * Default `false` */
    stopWhenDone?: boolean;
}

interface Status {
    total: number;
    succeeded: number;
    failed: number;
    timedOut: number;
    pending: number;
    running: number;
}

type StatusListener = (status: Status) => void;

const x = "Test";
x += "Test";