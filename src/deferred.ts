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

export function createDeferred<T>(): Deferred<T> {
    let _resolve: (value: T | Promise<T>) => void;
    let _reject: (reason?: any) => void;

    const promise = new Promise((resolve, reject) => {
        _resolve = resolve;
        _reject = reject;
    }) as Deferred<T>;

    promise.resolve = (value: T | Promise<T>) => _resolve(value);
    promise.reject = (reason: any) => _reject(reason);
    return promise;
};