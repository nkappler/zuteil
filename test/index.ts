import { Presets, SingleBar } from "cli-progress";
import type { Job, StatusListener } from "../src/types";
import { JobDispatcher } from "../src/zuteil";

// tslint:disable: no-console


const badSum = async (a: number, b: number) => new Promise<number>((resolve, reject) => {
    setTimeout(() => resolve(a + b), Math.random() * 10000);
    setTimeout(reject, 5000);
});

const doHundredTimes = (job: Job<any>) =>
    new Array(100)
        .fill(null)
        .map(async (_, i) =>
            await job(i)
        );

(async () => {
    const test1 = async () => {
        const result = doHundredTimes((i: number) => badSum(i, i).catch(() => null));

        console.log(await Promise.all(result));
    };
    // await test1();

    const test2 = async () => {
        const dispatcher = new JobDispatcher({
            startImmediate: true,
            timeout: 1000,
        });
        const bar = new SingleBar({
            stopOnComplete: true,
        }, Presets.legacy);
        bar.start(100, 0);

        const logProgess: StatusListener = (status) => {
            bar.update(status.succeeded);
        };

        const detach = dispatcher.attachListener(logProgess);

        const result = doHundredTimes((i: number) => dispatcher.addJob(() => badSum(i, i)));

        console.log(await Promise.all(result));

        detach();

    };
    await test2();
})()
    // @ts-ignore
    .then(process.exit)
