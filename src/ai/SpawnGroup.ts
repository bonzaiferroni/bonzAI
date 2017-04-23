import {SpawnReservation} from "../interfaces";
import {helper} from "../helpers/helper";
import {Scheduler} from "../Scheduler";
export class SpawnGroup {

    public spawns: Spawn[];
    public extensions: Extension[];
    public room: Room;
    public pos: RoomPosition;

    public idleSpawnCount: number;
    public isAvailable: boolean;
    public currentSpawnEnergy: number;
    public maxSpawnEnergy: number;

    public memory: {
        nextCheck: number;
        log: {
            availability: number
            history: number[]
            longHistory: number[]
        },
    };

    constructor(room: Room) {
        this.room = room;
        this.spawns = _.filter(this.room.find<StructureSpawn>(FIND_MY_SPAWNS),
            s => s.canCreateCreep([MOVE]) !== ERR_RCL_NOT_ENOUGH);
        if (!this.room.memory.spawnMemory) { this.room.memory.spawnMemory = {}; }
        this.memory = this.room.memory.spawnMemory;
        this.extensions = room.findStructures(STRUCTURE_EXTENSION) as StructureExtension[];
        this.manageSpawnLog();
        this.idleSpawnCount = this.getIdleSpawnCount();
        this.isAvailable = this.availabilityCheck();
        this.currentSpawnEnergy = this.room.energyAvailable;
        this.maxSpawnEnergy = this.room.energyCapacityAvailable;
        this.pos = _.head(this.spawns).pos;
    }

    public spawn (build: string[], name: string, memory?: any, reservation?: SpawnReservation): string | number {
        let outcome;
        this.isAvailable = false;
        if (reservation) {
            if (this.idleSpawnCount < reservation.spawns) { return ERR_BUSY; }
            if (this.currentSpawnEnergy < reservation.currentEnergy) { return ERR_NOT_ENOUGH_RESOURCES; }
        }
        for (let spawn of this.spawns) {
            if (spawn.spawning == null) {
                outcome = spawn.createCreep(build, name, memory);
                if (Memory.playerConfig.muteSpawn) { break; } // early

                if (outcome === ERR_INVALID_ARGS) {
                    console.log("SPAWN: invalid args for creep\nbuild:", build, "\nname:", name, "\ncount:",
                        build.length);
                }
                if (_.isString(outcome)) {
                    console.log("SPAWN: building " + name);
                } else if (outcome === ERR_NOT_ENOUGH_RESOURCES) {
                    if (Game.time % 10 === 0) {
                        console.log("SPAWN:", this.room.name, "not enough energy for", name, "cost:",
                            SpawnGroup.calculateBodyCost(build), "current:", this.currentSpawnEnergy, "max",
                            this.maxSpawnEnergy);
                    }
                } else if (outcome !== ERR_NAME_EXISTS && outcome !== ERR_RCL_NOT_ENOUGH) {
                    console.log("SPAWN:", this.room.name, "had error spawning " + name + ", outcome: " + outcome);
                }
                break;
            }
        }
        return outcome;
    }

    private getIdleSpawnCount(): number {
        let count = 0;
        for (let spawn of this.spawns) {
            if (spawn.spawning === null) {
                count++;
            }
        }
        this.memory.log.availability += count;
        Memory.stats["spawnGroups." + this.room.name + ".idleCount"] = count;
        return count;
    }

    private getCurrentSpawnEnergy(): number {
        let sum = 0;
        for (let ext of this.extensions) {
            sum += ext.energy;
        }
        for (let spawn of this.spawns) {
            sum += spawn.energy;
        }
        return sum;
    }

    private getMaxSpawnEnergy() {
        let contollerLevel = this.room.controller.level;
        let extensionCount = this.extensions.length;
        let spawnCount = this.spawns.length;

        return spawnCount * SPAWN_ENERGY_CAPACITY + extensionCount * EXTENSION_ENERGY_CAPACITY[contollerLevel];
    }

    public static calculateBodyCost(body: string[]): number {
        let sum = 0;
        for (let part of body) {
            sum += BODYPART_COST[part];
        }
        return sum;
    }

    public canCreateCreep(body: string[]): boolean {
        let cost = SpawnGroup.calculateBodyCost(body);
        return cost <= this.currentSpawnEnergy;
    }

    // proportion allows you to scale down the body size if you don't want to use all of your spawning energy
    // for example, proportion of .5 would return the max units per cost if only want to use half of your spawn-capacity
    public maxUnitsPerCost(unitCost: number, proportion: number = 1): number {
        return Math.floor((this.maxSpawnEnergy * proportion) / unitCost);
    }

    public maxUnits(body: string[], proportion?: number) {
        let cost = SpawnGroup.calculateBodyCost(body);
        return Math.min(this.maxUnitsPerCost(cost, proportion), Math.floor(50 / body.length));
    }

    private manageSpawnLog() {
        if (!this.memory.log) { this.memory.log = {availability: 0, history: [], longHistory: []}; }

        if (Game.time % 100 !== 0) { return; }
        let log = this.memory.log;
        let average = log.availability / 100;
        log.availability = 0;
        log.history.push(average);
        while (log.history.length > 5) { log.history.shift(); }

        if (Game.time % 500 !== 0) { return; }
        let longAverage = _.sum(log.history) / 5;
        log.longHistory.push(longAverage);
        while (log.longHistory.length > 5) { log.longHistory.shift(); }
    }

    public showHistory() {
        console.log("Average availability in", this.room.name, "the last 5 creep generations (1500 ticks):");
        console.log(this.memory.log.history);
        console.log("Average availability over the last 75000 ticks (each represents a period of 15000 ticks)");
        console.log(this.memory.log.longHistory);
    }

    get averageAvailability(): number {
        if (this.memory.log.history.length === 0) {
            return .1;
        }
        return _.last(this.memory.log.history) as number;
    }

    public finalize() {
        if (this.isAvailable) {
            this.memory.nextCheck = Game.time + Scheduler.randomInterval(10);
        }
    }

    private availabilityCheck() {
        if (Game.time < this.memory.nextCheck) {
            return false;
        }
        return this.idleSpawnCount > 0;
    }
}
