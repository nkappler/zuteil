requirejs(["zuteil/zuteil"], zuteil => {
    const JobDispatcher = zuteil.JobDispatcher

    const badSum = (a, b) => new Promise((resolve, reject) => {
        setTimeout(() => resolve(a + b), Math.random() * 10000);
        setTimeout(reject, 5000);
    });

    const dispatcher = new JobDispatcher({
        concurrentLimit: 5
    });
    let time = 0;

    const container = document.getElementById("results");

    // const results = new Array(100).fill(undefined).map((_v, i) => {
    //     // container.innerHTML += `<span id="${i}">...</span>`;
    //     return dispatcher.addJob(() => badSum(i + 1, i + 1))
    // });
    const results = new Array(10).fill(undefined).map((_v, i) => {
        // container.innerHTML += `<span id="${i}">...</span>`;
        return dispatcher.addJob(() => new Promise(r => setTimeout(r, 500)))
    });

    // results.forEach(async (r, i) => {
    //     const v = await r;
    //     requestAnimationFrame(() => document.getElementById(i).innerText = v);
    // });

    dispatcher.attachListener(status => {
        document.getElementById("progress").value = status.succeeded;
        document.getElementById("succeeded").innerText = status.succeeded;
        document.getElementById("failed").innerText = status.running;
        document.getElementById("timedout").innerText = status.pending;
        if (status.running == 0) {
            time = -1;
        }
    });

    const updateTime = () => {
        var t = Math.round((performance.now() - time) / 10 - 200) / 100;
        document.getElementById("time").innerText = t + "s";
        if (time > 0) requestAnimationFrame(updateTime);
    }
    time = performance.now();

    setTimeout(() => {


        dispatcher.start();

        updateTime();
    }, 2000);
});