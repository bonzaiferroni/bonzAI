import {BootstrapOperation} from "../operations/BootstrapOperation";
export class BootMiningGuru {
    private operation: BootstrapOperation;
    private memory: {
        energyWaiting: number;
        energyHistory: number[];
    };

    constructor(operation: BootstrapOperation) {
        this.operation = operation;
        if (!operation.memory.bootGuru) { operation.memory.bootGuru = {}; }
        this.memory = operation.memory.bootGuru;
    }

    public spawnSaturated(): boolean {
        if (!this.memory.energyHistory) { this.memory.energyHistory = []; }
        this.memory.energyHistory.push(this.memory.energyWaiting);
        while (this.memory.energyHistory.length > 20) { this.memory.energyHistory.shift(); }
        let avg = _.sum(this.memory.energyHistory) / this.memory.energyHistory.length;
        if (avg > 1000 || Game.time % 12 === 0) {
            console.log("spawn saturated", avg, this.operation.roomName);
        }
        this.memory.energyWaiting = 0;
        return avg > 300 * this.operation.room.controller.level;
    }

    public registerEnergyWaiting(energy: number) {
        this.memory.energyWaiting += energy;
    }
}