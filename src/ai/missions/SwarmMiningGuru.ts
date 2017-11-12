import {SwarmOperation} from "../operations/BootstrapOperation";
export class SwarmMiningGuru {
    private operation: SwarmOperation;
    private memory: {
        energyWaiting: number;
        energyHistory: number[];
    };

    constructor(operation: SwarmOperation) {
        this.operation = operation;
        if (!operation.memory.swarmGuru) { operation.memory.swarmGuru = {}; }
        this.memory = operation.memory.swarmGuru;
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