import {SpawnReservation} from "./interfaces";
export class SpawnGroup {

    spawns: Spawn[];
    extensions: Extension[];
    room: Room;
    pos: RoomPosition;

    availableSpawnCount: number;
    isAvailable: boolean;
    currentSpawnEnergy: number;
    maxSpawnEnergy: number;

    constructor(room: Room) {
        this.room = room;
        this.spawns = room.find(FIND_MY_SPAWNS) as Spawn[];
        this.extensions = room.findStructures(STRUCTURE_EXTENSION) as StructureExtension[];
        this.manageSpawnLog();
        this.availableSpawnCount = this.getSpawnAvailability();
        this.isAvailable = this.availableSpawnCount > 0;
        this.currentSpawnEnergy = this.room.energyAvailable;
        this.maxSpawnEnergy = this.room.energyCapacityAvailable;
        this.pos = _.head(this.spawns).pos;
    }

    spawn (build: string[], name: string, memory: any, reservation: SpawnReservation): string | number {
        let outcome;
        this.isAvailable = false;
        if (reservation) {
            if (this.availableSpawnCount < reservation.spawns) return ERR_BUSY;
            if (this.currentSpawnEnergy < reservation.currentEnergy) return ERR_NOT_ENOUGH_RESOURCES;
        }
        for (let spawn of this.spawns) {
            if (spawn.spawning == null) {
                outcome = spawn.createCreep(build, name, memory);
                if (Memory.playerConfig.muteSpawn) break; // early

                if (outcome === ERR_INVALID_ARGS) {
                    console.log("SPAWN: invalid args for creep\nbuild:", build, "\nname:", name, "\ncount:", build.length);
                }
                if (_.isString(outcome)) {
                    console.log("SPAWN: building " + name);
                }
                else if (outcome === ERR_NOT_ENOUGH_RESOURCES) {
                    if (Game.time % 10 === 0) {
                        console.log("SPAWN:", this.room.name, "not enough energy for", name, "cost:", SpawnGroup.calculateBodyCost(build),
                        "current:", this.currentSpawnEnergy, "max", this.maxSpawnEnergy);
                    }
                }
                else if (outcome !== ERR_NAME_EXISTS) {
                    console.log("SPAWN:", this.room.name, "had error spawning " + name + ", outcome: " + outcome);
                }
                break;
            }
        }
        return outcome;
    }

    private getSpawnAvailability(): number {
        let count = 0;
        for (let spawn of this.spawns) {
            if (spawn.spawning === null) {
                count++;
            }
        }
        this.room.memory.spawnLog.availability += count;
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
    // for example, proportion of .5 would return the max units per cost if only want to use half of your spawning capacity
    public maxUnitsPerCost(unitCost: number, proportion: number = 1): number {
        return Math.floor((this.maxSpawnEnergy * proportion) / unitCost);
    }

    public maxUnits(body: string[], proportion?: number) {
        let cost = SpawnGroup.calculateBodyCost(body);
        return Math.min(this.maxUnitsPerCost(cost, proportion), Math.floor(50 / body.length));
    }

    private manageSpawnLog() {
        if (!this.room.memory.spawnLog) this.room.memory.spawnLog = {availability: 0, history: [], longHistory: []};

        if (Game.time % 1500 !== 0) return; // early
        let log = this.room.memory.spawnLog;
        let average = log.availability / 1500;
        log.availability = 0;
        /*
        if (average > 1) console.log("SPAWNING:", this.room, "not very busy (avg", average, "idle out of",
            this.spawns.length, "), perhaps add more harvesting");
        if (average < .1) console.log("SPAWNING:", this.room, "very busy (avg", average, "idle out of",
            this.spawns.length, "), might want to reduce harvesting");
            */
        log.history.push(average);
        while (log.history.length > 5) log.history.shift();

        if (Game.time % 15000 !== 0) return; // early
        let longAverage = _.sum(log.history) / 5;
        log.longHistory.push(longAverage);
        while (log.history.length > 5) log.history.shift();
    }

    public showHistory() {
        console.log("Average availability in", this.room.name, "the last 5 creep generations (1500 ticks):");
        console.log(this.room.memory.spawnLog.history);
        console.log("Average availability over the last 75000 ticks (each represents a period of 15000 ticks)");
        console.log(this.room.memory.spawnLog.longHistory);
    }

    public averageAvailability(): number {
        return _.last(this.room.memory.spawnLog.history) as number;
    }
}