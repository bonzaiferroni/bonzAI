import {Operation} from "./Operation";
import {TransportAnalysis, SpawnReservation, HeadCountOptions} from "./interfaces";
import {Empire} from "./Empire";
import {SpawnGroup} from "./SpawnGroup";
import {DESTINATION_REACHED} from "./constants";
import {helper} from "./helper";
export abstract class Mission {

    opName: string;
    opType: string;
    flag: Flag;
    empire: Empire;
    memory: any;
    spawnGroup: SpawnGroup;
    sources: Source[];

    room: Room;
    name: string;
    allowSpawn: boolean;
    hasVision: boolean;
    waypoints: Flag[];

    partnerPairing: {[role: string]: Creep[]} = {};
    distanceToSpawn: number;

    constructor(operation: Operation, name: string, allowSpawn: boolean = true) {
        this.name = name;
        this.opName = operation.name;
        this.opType = operation.type;
        Object.defineProperty(this, "flag", { enumerable: false, value: operation.flag });
        Object.defineProperty(this, "room", { enumerable: false, value: operation.flag.room });
        Object.defineProperty(this, "empire", { enumerable: false, value: operation.empire });
        Object.defineProperty(this, "spawnGroup", { enumerable: false, value: operation.spawnGroup, writable: true });
        Object.defineProperty(this, "sources", { enumerable: false, value: operation.sources });
        if (!operation.flag.memory[this.name]) operation.flag.memory[this.name] = {};
        this.memory = operation.flag.memory[this.name];
        this.allowSpawn = allowSpawn;
        if (this.room) this.hasVision = true;
        // initialize memory to be used by this mission
        if (!this.memory.spawn) this.memory.spawn = {};
        if (operation.waypoints && operation.waypoints.length > 0) {
            this.waypoints = operation.waypoints;
        }
    }

    /**
     * Init Phase - Used to initialize values for the following phases
     */
    abstract initMission();

    /**
     * RoleCall Phase - Used to find creeps and spawn any extra that are needed
     */
    abstract roleCall();

    /**
     * MissionAction Phase - Primary phase for world-changing functions like creep.harvest(), tower.attack(), etc.
     */
    abstract missionActions();

    /**
     * Finish Phase - Do any remaining work that needs to happen after the other phases
     */
    abstract finalizeMission();

    /**
     * Invalidate Cache Phase - Do any housekeeping that might need to be done
     */
    abstract invalidateMissionCache();

    /**
     * General purpose function for spawning creeps
     * @param roleName - Used to find creeps belonging to this role, examples: miner, energyCart
     * @param getBody - function that returns the body to be used if a new creep needs to be spawned
     * @param max - how many creeps are currently desired, pass 0 to halt spawning
     * @param options - Optional parameters like prespawn interval, whether to disable attack notifications, etc.
     * @returns {Creep[]}
     */
    protected headCount(roleName: string, getBody: () => string[], max: number, options?: HeadCountOptions): Creep[] {
        if (!options) options = {};
        let roleArray = [];
        if (!this.memory.spawn[roleName]) this.memory.spawn[roleName] = this.findOrphans(roleName);

        let count = 0;
        for (let i = 0; i < this.memory.spawn[roleName].length; i++ ) {
            let creepName = this.memory.spawn[roleName][i];
            let creep = Game.creeps[creepName];
            if (creep) {

                // newer code to implement waypoints/boosts
                let prepared = this.prepCreep(creep, options);
                if (prepared) {
                    roleArray.push(creep);
                }

                let ticksNeeded = 0;
                if (options.prespawn !== undefined) {
                    ticksNeeded += creep.body.length * 3;
                    ticksNeeded += options.prespawn;
                }
                if (creep.spawning || creep.ticksToLive > ticksNeeded) { count++; }
            }
            else {
                this.memory.spawn[roleName].splice(i, 1);
                Memory.creeps[creepName] = undefined;
                i--;
            }
        }

        if (this.allowSpawn && this.spawnGroup.isAvailable && (count < max) && (this.hasVision || options.blindSpawn)) {
            let creepName = this.opName + "_" + roleName + "_" + Math.floor(Math.random() * 100);
            let outcome = this.spawnGroup.spawn(getBody(), creepName, options.memory, options.reservation);
            if (_.isString(outcome)) this.memory.spawn[roleName].push(creepName);
        }

        return roleArray;
    }

    /**
     * Returns creep body array with desired number of parts in this order: WORK → CARRY → MOVE
     * @param workCount
     * @param carryCount
     * @param movecount
     * @returns {string[]}
     */
    protected workerBody(workCount: number, carryCount: number, movecount: number): string[] {
        let body: string [] = [];
        for (let i = 0; i < workCount; i++) {
            body.push(WORK);
        }
        for (let i = 0; i < carryCount; i++) {
            body.push(CARRY);
        }
        for (let i = 0; i < movecount; i++) {
            body.push(MOVE);
        }
        return body;
    }

    protected configBody(config: {[partType: string]: number}): string[] {
        let body: string[] = [];
        for (let partType in config) {
            let amount = config[partType];
            for (let i = 0; i < amount; i++) {
                body.push(partType);
            }
        }
        return body;
    }

    /**
     * Returns creep body array with the desired ratio of parts, governed by how much spawn energy is possible
     * @param workRatio
     * @param carryRatio
     * @param moveRatio
     * @param spawnFraction - proportion of spawn energy to be used up to 50 body parts, .5 would use half, 1 would use all
     * @param limit - set a limit to the number of units (useful if you know the exact limit, like with miners)
     * @returns {string[]}
     */
    protected bodyRatio(workRatio: number, carryRatio: number, moveRatio: number, spawnFraction: number, limit?: number): string[] {
        let sum = workRatio * 100 + carryRatio * 50 + moveRatio * 50;
        let partsPerUnit = workRatio + carryRatio + moveRatio;
        if (!limit) limit = Math.floor(50 / partsPerUnit);
        let maxUnits = Math.min(Math.floor((this.spawnGroup.maxSpawnEnergy * spawnFraction) / sum), limit);
        return this.workerBody(workRatio * maxUnits, carryRatio * maxUnits, moveRatio * maxUnits);
    }

    /**
     * General purpose checking for creep load
     * @param creep
     * @returns {boolean}
     */
    protected hasLoad(creep: Creep): boolean {
        if (creep.memory.hasLoad && _.sum(creep.carry) === 0) {
            creep.memory.hasLoad = false;
        }
        else if (!creep.memory.hasLoad && _.sum(creep.carry) === creep.carryCapacity) {
            creep.memory.hasLoad = true;
        }
        return creep.memory.hasLoad;
    }

    /**
     * Used to determine cart count/size based on transport distance and the bandwidth needed
     * @param distance - distance (or average distance) from point A to point B
     * @param load - how many resource units need to be transported per tick (example: 10 for an energy source)
     * @returns {{body: string[], cartsNeeded: number}}
     */
    protected analyzeTransport(distance: number, load: number): TransportAnalysis {
        if (!this.memory.transportAnalysis) {
            // this value is multiplied by 2.1 to account for travel both ways and a small amount of error for traffic/delays
            let bandwidthNeeded = distance * load * 2.1;
            // cargo units are just 2 CARRY, 1 MOVE, which has a capacity of 100
            let cargoUnitsNeeded = Math.ceil(bandwidthNeeded / 100);
            let maxUnitsPossible = this.spawnGroup.maxUnits([CARRY, CARRY, MOVE]);
            let cartsNeeded = Math.ceil(cargoUnitsNeeded / maxUnitsPossible );
            let cargoUnitsPerCart = Math.ceil(cargoUnitsNeeded / cartsNeeded);
            let body = this.workerBody(0, cargoUnitsPerCart * 2, cargoUnitsPerCart);
            this.memory.transportAnalysis = {
                load: load,
                distance: distance,
                body: body,
                cartsNeeded: cartsNeeded,
                carryCount: cargoUnitsPerCart * 2 };
        }
        return this.memory.transportAnalysis;
    }

    /**
     * General-purpose energy getting, will look for an energy source in the same room as the operation flag (not creep)
     * @param creep
     * @param nextDestination
     * @param highPriority - allows you to withdraw energy before a battery reaches an optimal amount of energy, jumping
     * ahead of any other creeps trying to get energy
     * @param getFromSource
     */

    protected procureEnergy(creep: Creep, nextDestination?: RoomObject, highPriority = false, getFromSource = false) {
        let battery = this.getBattery(creep);

        if (battery) {
            if (creep.pos.isNearTo(battery)) {
                let outcome;
                if (highPriority) {
                    if (battery.store.energy >= 50) {
                        outcome = creep.withdraw(battery, RESOURCE_ENERGY);
                    }
                }
                else {
                    outcome = creep.withdrawIfFull(battery, RESOURCE_ENERGY);
                }
                if (outcome === OK) {
                    creep.memory.batteryId = undefined;
                    if (nextDestination) {
                        creep.blindMoveTo(nextDestination);
                    }
                }
            }
            else {
                creep.blindMoveTo(battery);
            }
        }
        else {
            if (getFromSource) {
                let closest = creep.pos.findClosestByRange<Source>(this.sources);
                if (closest) {
                    if (creep.pos.isNearTo(closest)) {
                        creep.harvest(closest);
                    }
                    else {
                        creep.blindMoveTo(closest);
                    }
                }
                else if (!creep.pos.isNearTo(this.flag)) {
                    creep.blindMoveTo(this.flag);
                }
            }
            else if (!creep.pos.isNearTo(this.flag)) {
                creep.blindMoveTo(this.flag);
            }
        }
    }

    /**
     * Will return storage if it is available, otherwise will look for an alternative battery and cache it
     * @param creep - return a battery relative to the room that the creep is currently in
     * @returns {any}
     */

    protected getBattery(creep: Creep): Creep | StructureContainer | StructureTerminal | StructureStorage {
        let minEnergy = creep.carryCapacity - creep.carry.energy;
        if (creep.room.storage && creep.room.storage.store.energy > minEnergy) {
            return creep.room.storage;
        }

        return creep.rememberBattery();
    }

    protected getFlagSet(identifier: string, max = 10): Flag[] {

        let flags = [];
        for (let i = 0; i < max; i++) {
            let flag = Game.flags[this.opName + identifier + i];
            if (flag) {
                flags.push(flag);
            }
        }
        return flags;
    }

    protected flagLook(lookConstant: string, identifier: string, max = 10) {

        let objects = [];

        let flags = this.getFlagSet(identifier, max);
        for (let flag of flags) {
            if (flag.room) {
                let object = _.head(flag.pos.lookFor(lookConstant));
                if (object) {
                    objects.push(object);
                }
                else {
                    flag.remove();
                }
            }
        }

        return objects;
    }

    getStorage(pos: RoomPosition): StructureStorage {
        if (this.memory.tempStorageId) {
            let storage = Game.getObjectById<StructureStorage>(this.memory.tempStorageId);
            if (storage) {
                return storage;
            }
            else {
                console.log("ATTN: Clearing temporary storage id due to not finding object in", this.opName);
                this.memory.tempStorageId = undefined;
            }
        }

        if (this.memory.storageId) {
            let storage = Game.getObjectById<StructureStorage>(this.memory.storageId);
            if (storage && storage.room.controller.level >= 4) {
                return storage;
            }
            else {
                console.log("ATTN: attempting to find better storage for", this.name, "in", this.opName);
                this.memory.storageId = undefined;
                return this.getStorage(pos);
            }
        }
        else {
            let storages = _.filter(this.empire.storages, (s: Structure) => s.room.controller.level >= 4);
            let storage = pos.findClosestByLongPath(storages) as Storage;
            if (!storage) {
                storage = pos.findClosestByRoomRange(storages) as Storage;
                console.log("couldn't find storage via path, fell back to find closest by room range for", this.opName);
            }
            if (storage) {
                console.log("ATTN: attempting to find better storage for", this.name, "in", this.opName);
                this.memory.storageId = storage.id;
                return storage;
            }
        }
    }

    moveToFlag(creep: Creep) {
        if (!creep.pos.isNearTo(this.flag)) {
            creep.blindMoveTo(this.flag);
        }
    }

    supplyCartActions(cart: Creep, suppliedCreep: Creep) {
        if (cart.carry.energy < cart.carryCapacity) {
            this.procureEnergy(cart, suppliedCreep);
            return;
        }

        // has energy
        if (!suppliedCreep || suppliedCreep.carry.energy > suppliedCreep.carryCapacity * 0.8) {
            cart.idleOffRoad(this.flag);
            return;
        }

        // has target with room for more energy
        let outcome = cart.transfer(suppliedCreep, RESOURCE_ENERGY);
        if (outcome === ERR_NOT_IN_RANGE) {
            cart.blindMoveTo(suppliedCreep);
        }
        else if (outcome === OK) {
            this.procureEnergy(cart, suppliedCreep);
        }
    }

    refillCartActions(cart: Creep, structures: Structure[], findLowest?: boolean) {

        if (cart.room.name !== this.flag.pos.roomName) {
            this.moveToFlag(cart);
            return; // early
        }

        let hasLoad = this.hasLoad(cart);
        if (!hasLoad) {
            this.procureEnergy(cart, cart.pos.findClosestByRange(structures), true);
            return;
        }

        let target;
        if (findLowest) {
            target = _.sortBy(structures, (structure: StructureTower | StructureSpawn | StructureExtension) => structure.energy)[0];
        }
        else {
            target = cart.pos.findClosestByRange(structures) as StructureExtension | StructureSpawn;
        }
        if (!target) {
            cart.memory.hasLoad = cart.carry.energy === cart.carryCapacity;
            cart.yieldRoad(this.flag);
            return;
        }

        // has target
        if (!cart.pos.isNearTo(target)) {
            cart.blindMoveTo(target);
            return;
        }

        // is near to target
        let outcome = cart.transfer(target, RESOURCE_ENERGY);
        if (outcome === OK && cart.carry.energy >= target.energyCapacity) {
            structures = _.pull(structures, target);
            target = cart.pos.findClosestByRange(structures) as StructureExtension | StructureSpawn;
            if (target && !cart.pos.isNearTo(target)) {
                cart.blindMoveTo(target);
            }
        }
    }

    private findOrphans(roleName: string) {
        let creepNames = [];
        for (let creepName in Game.creeps) {
            if (creepName.indexOf(this.opName + "_" + roleName + "_") > -1) {
                creepNames.push(creepName);
            }
        }
        return creepNames;
    }

    protected recycleCreep(creep: Creep) {
        let spawn = this.spawnGroup.spawns[0];
        if (creep.pos.isNearTo(spawn)) {
            spawn.recycleCreep(creep);
        }
        else {
            creep.blindMoveTo(spawn);
        }
    }

    private prepCreep(creep: Creep, options: HeadCountOptions) {
        if (!creep.memory.prep) {
            this.disableNotify(creep);
            let boosted = creep.seekBoost(creep.memory.boosts, creep.memory.allowUnboosted);
            if (!boosted) return false;
            let outcome = creep.travelByWaypoint(this.waypoints);
            if (outcome !== DESTINATION_REACHED) return false;
            creep.memory.prep = true;
        }
        return true;
    }

    setBoost(activateBoost: boolean) {
        let oldValue = this.memory.activateBoost;
        this.memory.activateBoost = activateBoost;
        return "changing boost activation for " + this.name + " in " + this.opName + " from " + oldValue + " to " + activateBoost;
    }

    setMax(max: number) {
        let oldValue = this.memory.max;
        this.memory.max = max;
        return "changing max creeps for " + this.name + " in " + this.opName + " from " + oldValue + " to " + max;
    }

    findPartnerships(creeps: Creep[], role: string) {
        for (let creep of creeps) {
            if (!creep.memory.partner) {
                if (!this.partnerPairing[role]) this.partnerPairing[role] = [];
                this.partnerPairing[role].push(creep);
                for (let otherRole in this.partnerPairing) {
                    if (role === otherRole) continue;
                    let otherCreeps = this.partnerPairing[otherRole];
                    let closestCreep;
                    let smallestAgeDifference = Number.MAX_VALUE;
                    for (let otherCreep of otherCreeps) {
                        let ageDifference = Math.abs(creep.ticksToLive - otherCreep.ticksToLive);
                        if (ageDifference < smallestAgeDifference) {
                            smallestAgeDifference = ageDifference;
                            closestCreep = otherCreep;
                        }
                    }

                    if (closestCreep) {
                        closestCreep.memory.partner = creep.name;
                        creep.memory.partner = closestCreep.name;
                    }
                }
            }
        }
    }

    protected findDistanceToSpawn(destination: RoomPosition): number {
        if (!this.memory.distanceToSpawn) {
            if (this.waypoints && this.waypoints.length > 0 && this.waypoints[0].memory.portalTravel) {
                console.log("SPAWN: using portal travel in", this.name + ", distanceToSpawn is set to:", 200);
                this.memory.distanceToSpawn = 200;
            }
            else {
                let distance = 0;
                let lastPos = this.spawnGroup.pos;
                if (this.waypoints) {
                    for (let waypoint of this.waypoints) {
                        distance += lastPos.getPathDistanceTo(waypoint.pos);
                        lastPos = waypoint.pos;
                    }
                }
                distance += lastPos.getPathDistanceTo(destination);
                if (distance > 500) {
                    console.log("WARNING: spawn distance (" + distance +
                        ") much higher than would usually be expected, setting to max of 500");
                    distance = 500;
                }

                console.log("SPAWN: found new distance for", this.name + ":", distance);
                this.memory.distanceToSpawn = distance;
            }
        }

        return this.memory.distanceToSpawn;
    }

    protected disableNotify(creep: Creep) {
        if (!creep.memory.notifyDisabled) {
            creep.notifyWhenAttacked(false);
            creep.memory.notifyDisabled = true;
        }
    }

    protected pavePath(start: {pos: RoomPosition}, finish: {pos: RoomPosition}, rangeAllowance: number) {
        if (Object.keys(Game.constructionSites).length > 40) return;
        if (Game.time - this.memory.paveTick < 1000) return;

        let ret = PathFinder.search(start.pos, [{pos: finish.pos, range: rangeAllowance}], {
            plainCost: 2,
            swampCost: 3,
            maxOps: 4000,
            roomCallback: (roomName: string): CostMatrix => {
                let room = Game.rooms[roomName];
                if (!room) return;

                let matrix = new PathFinder.CostMatrix();
                helper.addStructuresToMatrix(matrix, room);

                // avoid container adjacency
                let sources = room.find<Source>(FIND_SOURCES);
                for (let source of sources) {
                    let container = source.findMemoStructure<StructureContainer>(STRUCTURE_CONTAINER, 1);
                    if (container) {
                        helper.blockOffMatrix(matrix, container, 1, 10);
                    }
                }

                // add construction sites too
                let constructionSites = room.find<ConstructionSite>(FIND_CONSTRUCTION_SITES);
                for (let site of constructionSites) {
                    if (site.structureType === STRUCTURE_ROAD) {
                        matrix.set(site.pos.x, site.pos.y, 1);
                    }
                }

                return matrix;
            },
        });

        if (ret.incomplete) {
            console.log(`pavePath got an incomplete path, please investigate (${this.opName})`);
            return;
        }

        let foundIncompletePath = false;
        for (let i = 0; i < ret.path.length; i++) {
            let position = ret.path[i];
            if (position.isNearExit(0)) continue;
            let road = position.lookForStructure(STRUCTURE_ROAD);
            if (road) continue;
            let construction = position.lookFor<ConstructionSite>(LOOK_CONSTRUCTION_SITES)[0];
            if (construction && construction.structureType === STRUCTURE_ROAD) continue;
            position.createConstructionSite(STRUCTURE_ROAD);
            foundIncompletePath = true;
            console.log(`placed construction ${position}`);
            return;
        }

        this.memory.paveTick = Game.time;
    }
}