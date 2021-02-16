[![https://nkappler.de/zuteil/lcov-report/index.html](https://img.shields.io/badge/coverage-100%25-brightgreen)](https://nkappler.de/zuteil/lcov-report/index.html)
[![npm](https://img.shields.io/npm/v/zuteil.svg)](https://www.npmjs.com/package/zuteil)
![npm](https://img.shields.io/npm/types/zuteil.svg)
# zuteil

A highly configurable dispatcher for async jobs, written in TypeScript

## What zuteil is:

zuteil can be used to control how a number of Jobs get executed. A Job is a function that returns a Promise. You might also call it an Action, a Task, a Callback or just an Async Function. I'll use Job since it is concise. You can configure zuteil to only execute a number of jobs at once, starting new ones as others finish, or to retry failed jobs a number of times, or to cancel long running jobs after a given timeout. Execution can be stopped and started at any time and any number of Status Listeners can be attached to be notified when a job is added, started, finishes, gets aborted or fails.

Possible use cases could include:

- Limiting the number of concurrent network requests,
- Reducing Load on the main thread / UI,
- Queuing up Jobs and dispatching them all at once,
- Making unreliable functions more reliable at the cost of time,
- Keeping track of progress for a large amount of jobs.

## What zuteil is **not**:

zuteil is not a multithreading solution. Although you can run as many jobs as you want concurrently, they are all run by the main thread, possibly blocking UI updates. You certainly can implement jobs, that are executed in a worker, making this multithreaded, but zuteil does not offer this functionality by itself.  
Another limitation of zuteil is that aborted jobs still run in the background, their result is just ignored. Keep this in mind when your jobs have side effects.

## Install

Run the following command in your projects root folder:
```sh
> npm install --save zuteil
```

## Usage

Let's look at some examples to see what we can do with zuteil.  
I'll use Promises, async/await and arrow functions a lot. If you have never worked with promises or need a refresher on how these things work, I recommend these excellent articles from Nicolás Bevaqua over at ponyfoo.com:

- [ES6 Promises in Depth](https://ponyfoo.com/articles/es6-promises-in-depth)  
- [Understanding JavaScript's async await](https://ponyfoo.com/articles/understanding-javascript-async-await)  
- [ES6 Arrow Functions in Depth](https://ponyfoo.com/articles/es6-arrow-functions-in-depth)

---

Let's begin by writing our first job:

```typescript
const badSum = (a: number, b: number) => new Promise((resolve, reject) => {
    setTimeout(() => resolve(a + b), Math.random() * 10000);
    setTimeout(reject, 5000);
});
```
This function calculates the sum of two numbers given to it, `a` and `b`, but is quite terrible at doing so. Not only does it take up to 10 seconds, until the result is calculated (the first `setTimeout`), it will also fail after 5 seconds (the second `setTimeout`).
So effectively, it should take up to five seconds until the function either returns a result or fails, with a probability of 50% for either case. It is an awful function, but for our demonstration purposes it will do great.

Let's see how our assumptions hold by running it 100 times in parrallel. We will calculate the double of 1, 2, 3, ... 99, 100:

![](https://nkappler.de/zuteil/gif/1.gif)

---

Great, so the `badSum` function works as expected. What I didn't tell you, is that I already used zuteil in the above example, to easily set up the execution and get the status readouts:

```typescript
import {  JobDispatcher, Status } from "zuteil";

const dispatcher = new JobDispatcher();

for (var i = 1; i <= 100; i++) {
    dispatcher.addJob(() => badSum(i, i));
}

dispatcher.attachListener((status: Status) => {
    document.getElementById("progress").value = status.succeeded;
    document.getElementById("succeeded").innerText = status.succeeded;
    document.getElementById("failed").innerText = status.failed;
});

dispatcher.start();
```
Notice that we don't need a `try catch`, since the dispatcher handles that for us.  
I removed the code which shows the individual results and measures time, but just for the status readouts this is all you need:

1. import JobDispatcher and create a new Instance with default settings
2. Add 100 jobs
3. Add a status listener, which updates the progress bar and statistics
4. Start the execution

## Status Listeners

In the above example, we've attached a status listener to the dispatcher. Similar to the JavaScript Event System, you can add as many listeners as you want. To remove a listener again, simply call `dispatcher.detachListener`, passing the listener you want to remove as argument. Alternatively, the `dispatcher.attachListener` function returns a function to remove the listener as well.

```typescript
const listener = (status: Status) => { /* do something */ };

// attaching the listener and obtaining a detach function;
const detach = dispatcher.attachListener(listener);

// This:
detach();
// is equivalent to:
dispatcher.detachListener(listener);
```

Each listener is called, once a job is added, starts running, succeeds or fails due to error or timeout.  
The Status object passed to each listener looks like this:
```typescript
interface Status {
    total: number
    succeeded: number
    failed: number
    timedOut: number
    pending: number
    running: number
}
```

## Configuring the dispatcher

We can configure the dispatcher in many ways, to influence the result. These are all the options you can pass to the dispatcher constructor, which are all optional:

```typescript
interface Config {
    timeout?: number
    maxAttempts?: number
    concurrentLimit?: number
    startImmediate?: boolean
    stopWhenDone?: boolean
}
```

### `timeout`

In our example, the job will fail by itself after five seconds, if it hasn't produced a result in that timeframe. Per default, a job that does not fail runs until it is finished, which means that it might possibly run forever.
By specifying a timeout in milliseconds, the job will be aborted when the time runs out.  
We can use this to make our example finish faster, at the expense of getting less results. When we set the timeout to 2500ms, our test should finish twice as fast, but with roughly half the results:

```typescript
const dispatcher = new JobDispatcher({ timeout: 2500 });
```

![](https://nkappler.de/zuteil/gif/2.gif)

Notice, how we now have 0 failed jobs, since the jobs not finishing in time were aborted by the dispatcher and thus count towards "Timed out".

### `maxAttempts`
We can also make the calculations more likely to succeed, if we tell the dispatcher to retry failed or timed out jobs. You could even retry them indefinitely (`{ maxAttempts: Infinity }`) until they succeed, this could, however, take a very long time.  
Let's set `maxAttempts` to four. This means that the dispatcher retries any unsuccessful job up to three times. If we keep the timeout of 2.5 seconds from before, we would expect about 25% percent of jobs of each run to be successfull, giving us an expected total result of `1 - 0.75^4 = 68%` successful jobs, leaving us with 32 timed out jobs, with a total time elapsed of about 10 seconds.

```typescript
const dispatcher = new JobDispatcher({
    timeout: 2500,
    maxAttempts: 4
});
```

![](https://nkappler.de/zuteil/gif/3.gif)

### `concurrentLimit`
This option specifies the maximum number of jobs running at once. Per default, there is no limit.  
To demonstrate this, let's run 10 jobs in sequence by setting the limit to one. All jobs take half a second which should give a total of five seconds.

```typescript
const dispatcher = new JobDispatcher({ concurrentLimit: 1 });

for (var i = 0; i < 10; i++) {
    dispatcher.addJob(() => new Promise(r => setTimeout(r, 500)));
}

dispatcher.start();
```

![](https://nkappler.de/zuteil/gif/4.gif)

Notice how there is now only 1 Running job at any time and the other jobs are pending. if we now increase the concurrentLimit to two, it should be twice as fast. If we run 5 jobs at the same time, all jobs should be finished after just a second:

![](https://nkappler.de/zuteil/gif/5.gif)

![](https://nkappler.de/zuteil/gif/6.gif)

### `startImmediate`

If this option is set to true, the dispatcher will immediately execute newly added jobs, provided it is not circumvented by the `concurrentLimit`.

```typescript
// This:
const dispatcher = new JobDispatcher({ startImmediate: true });
// is equivalent to:
const dispatcher = new JobDispatcher();
dispatcher.start();
```

### `stopWhenDone`

If this option is enabled, the dispatcher will stop the execution, when all pending jobs are done. Jobs added at a later point will be pending until `dispatcher.start` is called again.

## How to handle jobs

What we haven't talked about so far, is how I referenced the results of the sum calculations in the first examples. The Status Listeners are great if you just want to know what's going on, but they won't be helpful if you care about the result of a job:

### `addJob`

The `addJob` function takes any asynchronous function - a job - as its first argument. Calling `addJob` will return a Promise, which will resolve once the job is done. As mentioned before, the dispatcher handles errors for us, so it is not necessary to use `try catch` or `promise.catch()`. If a job is unsuccessful, be it due to an error or timeout, the Promise returned by `addJob` will resolve with `null`.

```typescript
// this job will be executed at some time,
// when the dispatcher has capacity. No need to catch!
const result = await dispatcher.add(async () => 42);

if (result !== null) { 
    // this check is pointless in this example,
    // but should be included in real-world scenarios

    console.log(result * 2); // <-- 84
}
```

#### Job-level configurations

`addJob` can also take two more arguments, to give the added job special treatment. Its whole signature looks like this:
```typescript
async function addJob<T>(job: Job<T>, immediate: boolean, ignoreJobLimit: boolean): Promise<T | null>
```
#### `immediate`
If you pass `true` as second argument, the job is to be executed immediatly, i.e. it is added first in the queue of pending jobs. If the dispatcher has no capacity at the moment, the job will be the next one to be executed.

#### `ignoreJobLimit`
If you additionally pass `true` as third argument, the `concurrentLimit` is ignored for just this job, meaning it is definitely executed immediately, but the job limit might be exceeded.  

*This flag only has an effect, if you also pass `true` for the `immediate` argument.*

*Both the `immediate` and `ignoreJobLimit` flag only take effect, if the job execution is not halted.*

## Starting and stopping job execution

### `start`

Call `dispatcher.start()` to start or resume execution of jobs.


### `stop`

Call `dispatcher.stop()` to pause or stop execution of jobs.
Currently running jobs will be executed until they finish, fail or timeout.
To abort any running jobs, call `dispatcher.stop(true)`. This will re-insert the jobs in the front of the pending queue, meaning they get exuted before other pending jobs, once execution is resumed.  
*Note though, that aborted jobs are still running in the background, their result is just discarded. Keep this in mind when your jobs have side effects.*

## Using a global dispatcher

You can use the static method `getInstance` to obtain a global instance of the dispatcher, instead of calling the constructor `new JobDispatcher()`.
When calling the function for the first time, you can pass the same config options as for the constructor.  
*Passing config options to subsequent calls will have no effect*

```typescript
import { JobDispatcher } from "zuteil";

const dispatcher = JobDispatcher.getInstance({
    // configuration
});
```