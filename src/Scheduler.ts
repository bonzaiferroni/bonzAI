export class Scheduler {
    private static ranThisTick: {[taskName: string]: boolean };
    private static passiveProcesses: (() => void)[];
    private static passiveCpu: number;

    public static update() {
        this.ranThisTick = {};
        this.passiveProcesses = [];
        this.passiveCpu = 0;
    }

    public static finalize() {
        for (let process of this.passiveProcesses) {
            if (!this.underLimit()) { break; }
            try {
                process();
            } catch (e) {
                console.log(`SCHEDULER: error with passive process`);
                console.log(e.stack);
            }
        }
    }

    /**
     * Returns false every x ticks (on average) when CPU is below 250.
     * @param memory
     * @param taskName
     * @param interval
     * @returns {boolean}
     */

    public static delay(memory: any, taskName: string, interval: number): boolean {
        if (Game.cpu.getUsed() > 300) { return true; }
        if (Game.time < memory[taskName]) { return true; }

        // run only a single task type per tick
        if (this.ranThisTick[taskName]) { return true; }
        this.ranThisTick[taskName] = true;

        memory[taskName] = Game.time + Scheduler.randomInterval(interval);
        return false;
    }

    public static underLimit(): boolean {
        return Game.cpu.bucket > 9000 && Game.cpu.getUsed() < 320;
    }

    public static nextTick(memoryHost: {memory: any}, taskName: string) {
        memoryHost.memory[taskName] = Game.time + 1;
    }

    public static randomInterval(interval: number): number {
        return interval + Math.floor((Math.random() - .5) * interval * .2);
    }

    public static addPassiveProcess(func: () => void) {
        this.passiveProcesses.push(func);
    }
}
