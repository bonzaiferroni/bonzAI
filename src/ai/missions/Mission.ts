import {Operation} from "../operations/Operation";
import {SpawnGroup} from "../SpawnGroup";
import {HeadCountOptions, TransportAnalysis} from "../../interfaces";
import {DESTINATION_REACHED, MAX_HARVEST_DISTANCE, MAX_HARVEST_PATH} from "../../config/constants";
import {helper} from "../../helpers/helper";
import {Agent} from "../agents/Agent";
import {ROOMTYPE_SOURCEKEEPER, WorldMap, ROOMTYPE_ALLEY} from "../WorldMap";
import {Traveler} from "../Traveler";
import {RoomHelper} from "../RoomHelper";
import {empire} from "../Empire";
import {Scheduler} from "../../Scheduler";
import {Notifier} from "../../notifier";

export interface MissionState {
    hasVision?: boolean;
    sources?: Source[];
    spawnedThisTick?: string[];
    mineral?: Mineral;
}

export interface MissionMemory {
    [propName: string]: any;
    hc?: {[roleName: string]: string[]};
    activateBoost?: boolean;
    max?: number;
    distanceToSpawn?: number;
    transportAnalysis?: TransportAnalysis;
    storageId?: string;
    nextStorageCheck?: number;
    prespawn?: number;
}

export abstract class Mission {

    public flag: Flag;
    public roomName: string;
    public room: Room;
    public spawnGroup: SpawnGroup;
    public name: string;
    public operation: Operation;
    public allowSpawn: boolean;
    public state: MissionState;
    protected lastUpdated: number;
    protected cache: any;
    protected waypoints: Flag[];
    protected memory: MissionMemory;

    constructor(operation: Operation, name: string, allowSpawn: boolean = true) {
        this.operation = operation;
        this.name = name;
        this.roomName = operation.roomName;
        this.spawnGroup = operation.spawnGroup;
        this.allowSpawn = allowSpawn;
    }

    public initState() {
        this.lastUpdated = Game.time;
        this.flag = this.operation.flag;
        this.room = Game.rooms[this.operation.roomName];

        // initialize memory to be used by this mission
        if (!this.operation.memory[this.name]) { this.operation.memory[this.name] = {}; }
        this.memory = this.operation.memory[this.name];
        if (!this.memory.hc) { this.memory.hc = {}; }
        this.cache = {
            spawnedThisTick: [],
        };

        // find state
        this.state = {} as MissionState;
        if (this.room) {
            this.state.hasVision = true;
            this.state.sources = this.operation.state.sources;
            this.state.mineral = this.operation.state.mineral;
        } else {
            this.state.hasVision = false;
        }
    }

    /**
     * Init Phase - Used to initialize values on global update ticks
     */

    public baseInit() {
        try {
            this.initState();
            this.init();
        } catch (e) {
            Notifier.reportException(e, "init", this.name);
        }
    }

    protected abstract init();

    /**
     * Update Phase - Used to initialize values for the following phases
     */

    public static update(missions: MissionMap) {
        for (let missionName in missions) {
            let mission = missions[missionName];

            try {
                // Profiler.start("in_m." + missionName.substr(0, 3));
                mission.initState();
                mission.update();
                // Profiler.end("in_m." + missionName.substr(0, 3));
            } catch (e) {
                Notifier.reportException(e, "update", this.name);
            }
        }
    }

    protected abstract update();

    /**
     * RoleCall Phase - Used to find creeps and spawn any extra that are needed
     */

    public static roleCall(missions: MissionMap) {
        for (let missionName in missions) {
            let mission = missions[missionName];
            try {
                // Profiler.start("rc_m." + missionName.substr(0, 3));
                mission.roleCall();
                // Profiler.end("rc_m." + missionName.substr(0, 3));
            } catch (e) {
                Notifier.reportException(e, "roleCall", missionName);
            }
        }
    }

    protected abstract roleCall();

    /**
     * MissionAction Phase - Primary phase for world-changing functions like creep.harvest(), tower.attack(), etc.
     */

    public static actions(missions: MissionMap) {
        for (let missionName in missions) {
            let mission = missions[missionName];
            try {
                // Profiler.start("ac_m." + missionName.substr(0, 3));
                mission.actions();
                // Profiler.end("ac_m." + missionName.substr(0, 3));
            } catch (e) {
                Notifier.reportException(e, "actions", missionName);
            }
        }
    }

    protected abstract actions();

    /**
     * Finalize Phase - Do any remaining work that needs to happen after the other phases
     */

    public static finalize(missions: MissionMap) {
        for (let missionName in missions) {
            let mission = missions[missionName];
            try {
                // Profiler.start("fi_m." + missionName.substr(0, 3));
                mission.finalize();
                // Profiler.end("fi_m." + missionName.substr(0, 3));
            } catch (e) {
                Notifier.reportException(e, "finalize", missionName);
            }
        }
    }

    protected abstract finalize();

    /**
     * Invalidate Cache Phase - Garbage collection and random invalidation, happens infrequently
     */

    public static invalidateCache(missions: MissionMap) {
        for (let missionName in missions) {
            let mission = missions[missionName];
            try {
                mission.invalidateCache();
            } catch (e) {
                Notifier.reportException(e, "invalidate", missionName);
            }
        }
    }

    protected abstract invalidateCache();

    public setBoost(activateBoost: boolean) {
        let oldValue = this.memory.activateBoost;
        this.memory.activateBoost = activateBoost;
        return `changing boost activation for ${this.name} in ${this.operation.name} from ${oldValue} to ` +
            `${activateBoost}`;
    }

    public setMax(max: number) {
        let oldValue = this.memory.max;
        this.memory.max = max;
        return `changing max creeps for ${this.name} in ${this.operation.name} from ${oldValue} to ${max}`;
    }

    public setSpawnGroup(spawnGroup: SpawnGroup) {
        this.spawnGroup = spawnGroup;
    }

    public invalidateSpawnDistance() {
        if (this.memory.distanceToSpawn) {
            console.log(`SPAWN: resetting distance for ${this.name} in ${this.operation.name}`);
            this.memory.distanceToSpawn = undefined;
        }
    }

    protected headCount(roleName: string, getBody: () => string[], getMax: () => number,
                        options: HeadCountOptions = {}): Agent[] {
        return this.headCountAgents(Agent, roleName, getBody, getMax, options);
    }

    protected headCountAgents<T extends Agent>(constructor: new (creep: Creep, mission: Mission) => T,
                                               roleName: string, getBody: () => string[], getMax: () => number,
                                               options: HeadCountOptions = {}): T[] {
        if (!constructor) {
            constructor = (<any> Agent).constructor;
        }
        let agentArray = [];
        let creeps = this.headCountCreeps(roleName, getBody, getMax, options);
        for (let creep of creeps) {
            let agent = new constructor(creep, this);
            let prepared = this.prepAgent(agent, options);
            if (prepared) { agentArray.push(agent); }
        }
        return agentArray;
    }

    /**
     * General purpose function for spawning creeps
     * @param roleName - Used to find creeps belonging to this role, examples: miner, energyCart
     * @param getBody - function that returns the body to be used if a new creep needs to be spawned
     * @param getMax - function that returns how many creeps are currently desired, pass 0 to halt spawning
     * @param options - Optional parameters like prespawn interval, whether to disable attack notifications, etc.
     * @returns {Agent[]}
     */

    protected headCountCreeps(roleName: string, getBody: () => string[], getMax: () => number,
                              options: HeadCountOptions = {}): Creep[] {
        let creepArray = [];
        if (!this.memory.hc[roleName]) { this.memory.hc[roleName] = this.findOrphans(roleName); }
        let creepNames = this.memory.hc[roleName] as string[];

        let count = 0;
        for (let i = 0; i < creepNames.length; i++) {
            let creepName = creepNames[i];
            let creep = Game.creeps[creepName];
            if (creep) {
                creepArray.push(creep);
                let ticksNeeded = 0;
                if (options.prespawn !== undefined) {
                    ticksNeeded += creep.body.length * 3;
                    ticksNeeded += options.prespawn;
                }
                if (!creep.ticksToLive || creep.ticksToLive > ticksNeeded) { count++; }
            } else {
                creepNames.splice(i, 1);
                delete Memory.creeps[creepName];
                i--;
            }
        }

        let allowSpawn = this.spawnGroup.isAvailable && this.allowSpawn && (this.state.hasVision || options.blindSpawn);
        if (allowSpawn && count < getMax()) {
            let creepName = `${this.operation.name}_${roleName}_${Math.floor(Math.random() * 100)}`;
            let body = getBody();
            let outcome = this.spawnGroup.spawn(body, creepName, options.memory, options.reservation);
            if (_.isString(outcome)) {
                this.cache.spawnedThisTick.push(roleName);
                creepNames.push(creepName);
            }
        }

        return creepArray;
    }

    protected spawnedThisTick(roleName: string) {
        return _.includes(this.cache.spawnedThisTick, roleName);
    }

    protected roleCount(roleName: string, filter?: (creep: Creep) => boolean): number {
        if (!this.memory.hc || !this.memory.hc[roleName]) { return 0; }
        if (!filter) { return this.memory.hc[roleName].length; }
        return _.filter(this.memory.hc[roleName] as string[], x => filter(Game.creeps[x])).length;
    }

    protected swapRole(agent: Agent, fromRole: string, toRole: string) {
        console.log(`MISSION: ${agent.name} changed from ${fromRole} to ${toRole}`);
        _.pull(this.memory.hc[fromRole], agent.name);
        if (!this.memory.hc[toRole]) { this.memory.hc[toRole] = []; }
        this.memory.hc[toRole].push(agent.name);
    }

    protected spawnSharedAgent(roleName: string, getBody: () => string[]): Agent {
        let spawnMemory = this.spawnGroup.spawns[0].memory;
        if (!spawnMemory.communityRoles) { spawnMemory.communityRoles = {}; }

        let employerName = this.operation.name + this.name;
        let creep: Creep;
        if (spawnMemory.communityRoles[roleName]) {
            let creepName = spawnMemory.communityRoles[roleName];
            creep = Game.creeps[creepName];
            if (creep && Game.map.getRoomLinearDistance(this.spawnGroup.room.name, creep.room.name) <= 3) {
                if (creep.memory.employer === employerName || (!creep.memory.lastTickEmployed ||
                    Game.time - creep.memory.lastTickEmployed > 1)) {
                    creep.memory.employer = employerName;
                    creep.memory.lastTickEmployed = Game.time;
                    return new Agent(creep, this);
                }
            } else {
                delete Memory.creeps[creepName];
                delete spawnMemory.communityRoles[roleName];
            }
        }

        if (!creep && this.spawnGroup.isAvailable) {
            let creepName = "community_" + roleName;
            while (Game.creeps[creepName]) {
                creepName = "community_" + roleName + "_" + Math.floor(Math.random() * 100);
            }
            let outcome = this.spawnGroup.spawn(getBody(), creepName, undefined, undefined);
            if (_.isString(outcome)) {
                spawnMemory.communityRoles[roleName] = outcome;
            } else if (Game.time % 10 !== 0 && outcome !== ERR_NOT_ENOUGH_RESOURCES) {
                console.log(`error spawning community ${roleName} in ${this.operation.name} outcome: ${outcome}`);
            }
        }
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
     * @param spawnFraction - proportion of spawn energy to be used up to 50 body parts
     * @param limit - set a limit to the number of units (useful if you know the exact limit, like with miners)
     * @returns {string[]}
     */
    protected bodyRatio(workRatio: number, carryRatio: number, moveRatio: number, spawnFraction = 1,
                        limit?: number): string[] {
        let sum = workRatio * 100 + carryRatio * 50 + moveRatio * 50;
        let partsPerUnit = workRatio + carryRatio + moveRatio;
        if (!limit) { limit = Math.floor(50 / partsPerUnit); }
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
        } else if (!creep.memory.hasLoad && _.sum(creep.carry) === creep.carryCapacity) {
            creep.memory.hasLoad = true;
        }
        return creep.memory.hasLoad;
    }

    // deprecated
    /**
     * Used to determine cart count/size based on transport distance and the bandwidth needed
     * @param distance - distance (or average distance) from point A to point B
     * @param load - how many resource units need to be transported per tick (example: 10 for an energy source)
     * @returns {{body: string[], cartsNeeded: number}}
     */
    protected cacheTransportAnalysis(distance: number, load: number): TransportAnalysis {
        if (!this.memory.transportAnalysis || load !== this.memory.transportAnalysis.load
            || distance !== this.memory.transportAnalysis.distance) {
            this.memory.transportAnalysis = Mission.analyzeTransport(distance, load, this.spawnGroup.maxSpawnEnergy);
        }
        return this.memory.transportAnalysis;
    }

    // deprecated
    public static analyzeTransport(distance: number, load: number, maxSpawnEnergy: number): TransportAnalysis {
        // cargo units are just 2 CARRY, 1 MOVE, which has a capacity of 100 and costs 150
        let maxUnitsPossible = Math.min(Math.floor(maxSpawnEnergy /
            ((BODYPART_COST[CARRY] * 2) + BODYPART_COST[MOVE])), 16);
        let bandwidthNeeded = distance * load * 2.1;
        let cargoUnitsNeeded = Math.ceil(bandwidthNeeded / (CARRY_CAPACITY * 2));
        let cartsNeeded = Math.ceil(cargoUnitsNeeded / maxUnitsPossible);
        let cargoUnitsPerCart = Math.floor(cargoUnitsNeeded / cartsNeeded);
        return {
            load: load,
            distance: distance,
            cartsNeeded: cartsNeeded,
            carryCount: cargoUnitsPerCart * 2,
            moveCount: cargoUnitsPerCart,
        };
    }

    // deprecated
    public static loadFromSource(source: Source): number {
        return Math.max(source.energyCapacity, SOURCE_ENERGY_CAPACITY) / ENERGY_REGEN_TIME;
    }

    protected getFlagSet(identifier: string, max = 10): Flag[] {

        let flags = [];
        for (let i = 0; i < max; i++) {
            let flag = Game.flags[this.operation.name + identifier + i];
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
                } else {
                    flag.remove();
                }
            }
        }

        return objects;
    }

    // deprecated, use similar function on TransportGuru
    protected getStorage(pos: RoomPosition): StructureStorage {

        let flag = Game.flags[`${this.operation.name}_storage`];
        if (flag && flag.room) {
            // could also return containers and terminals, make sure that is intended
            let structure = _(flag.pos.lookFor<StructureStorage>(LOOK_STRUCTURES)).filter(x => x.store).head();
            if (structure) { return structure; }
        }

        if (this.room.storage && this.room.storage.my) { return this.room.storage; }

        // invalidated periodically
        if (!Scheduler.delay(this.memory, "nextStorageCheck", 10000)) {
            let bestStorages = RoomHelper.findClosest({pos: pos}, empire.network.storages,
                {linearDistanceLimit: MAX_HARVEST_DISTANCE });

            bestStorages = _.filter(bestStorages, value => value.distance < MAX_HARVEST_PATH);

            let resultPosition;
            if (bestStorages.length > 0) {
                let result = bestStorages[0].destination;
                resultPosition = result.pos;
                this.memory.storageId = result.id;
            } else {
                // override scheduler
                this.memory.nextStorageCheck = Game.time + 100; // Around 6 minutes
            }
            console.log(`MISSION: finding storage for ${this.operation.name}, result: ${resultPosition}`);
        }

        if (this.memory.storageId) {
            let storage = Game.getObjectById<StructureStorage>(this.memory.storageId);
            if (storage && storage.room.controller.level >= 4) {
                return storage;
            } else {
                this.memory.storageId = undefined;
                // override scheduler
                this.memory.nextStorageCheck = Game.time;
            }
        }
    }

    private findOrphans(roleName: string) {
        let creepNames = [];
        for (let creepName in Game.creeps) {
            if (creepName.indexOf(this.operation.name + "_" + roleName + "_") > -1) {
                creepNames.push(creepName);
            }
        }
        return creepNames;
    }

    protected recycleAgent(agent: Agent) {
        let spawn = this.spawnGroup.spawns[0];
        if (agent.pos.isNearTo(spawn)) {
            spawn.recycleCreep(agent.creep);
        } else {
            agent.travelTo(spawn);
        }
    }

    private prepAgent(agent: Agent, options: HeadCountOptions) {
        if (agent.memory.prep) { return true; }


        if (options.disableNotify) {
            this.disableNotify(agent);
        }

        // accomodate legacy code
        if (options.boosts === undefined) {
            options.boosts = agent.memory.boosts;
        }

        if (options.allowUnboosted === undefined) {
            options.allowUnboosted = agent.memory.allowUnboosted;
        }

        let boosted = agent.seekBoost(options.boosts, options.allowUnboosted);
        if (!boosted) { return false; }
        if (agent.creep.spawning) { return false; }
        if (!options.skipMoveToRoom && (agent.pos.roomName !== this.flag.pos.roomName || agent.pos.isNearExit(1))) {
            agent.avoidSK(this.flag);
            return;
        }
        agent.memory.prep = true;
    }

    protected findPartner(agent: Agent, partners: Agent[], tickDifference = 300): Agent {
        if (agent.memory.partner) {
            let partner = _.find(partners, x => x.name === agent.memory.partner);
            if (partner) {
                return partner;
            } else {
                delete agent.memory.partner;
                this.findPartner(agent, partners, tickDifference);
            }
        } else {
            let partner = _.find(partners, x => x.memory.partner === agent.name);
            if (!partner) {
                partner = _(partners)
                    .filter(x => !x.memory.partner && Math.abs(agent.ticksToLive - x.ticksToLive) <= tickDifference)
                    .min(x => Math.abs(agent.ticksToLive - x.ticksToLive));
            }
            if (_.isObject(partner)) {
                agent.memory.partner = partner.name;
                partner.memory.partner = agent.name;
                return partner;
            }
        }
    }

    protected findDistanceToSpawn(destination: RoomPosition): number {
        if (!this.memory.distanceToSpawn && this.spawnGroup) {
            let roomLinearDistance = Game.map.getRoomLinearDistance(this.spawnGroup.pos.roomName, destination.roomName);
            if (roomLinearDistance <= OBSERVER_RANGE) {
                let ret = Traveler.findTravelPath(this.spawnGroup.pos, destination);
                if (ret.incomplete) {
                    console.log(`SPAWN: error finding distance in ${this.operation.name} for object at ${destination}`);
                    console.log(`fallback to linearRoomDistance`);
                    this.memory.distanceToSpawn = roomLinearDistance * 50 + 25;
                } else {
                    this.memory.distanceToSpawn = ret.path.length;
                }
            } else {
                console.log(`SPAWN: likely portal travel detected in ${this.operation.name}, setting distance to 200`);
                this.memory.distanceToSpawn = 200;
            }
        }

        return this.memory.distanceToSpawn;
    }

    protected disableNotify(creep: Creep | Agent) {
        if (creep instanceof Agent) {
            creep = creep.creep;
        }

        if (!creep.memory.notifyDisabled) {
            creep.notifyWhenAttacked(false);
            creep.memory.notifyDisabled = true;
        }
    }

    protected registerPrespawn(agent: Agent) {
        if (!agent.memory.registered) {
            agent.memory.registered = true;
            const SANITY_CHECK = CREEP_LIFE_TIME / 2;
            this.memory.prespawn = Math.max(CREEP_LIFE_TIME - agent.creep.ticksToLive, SANITY_CHECK);
        }
    }

    protected medicActions(defender: Agent) {
        let hurtCreep = this.findHurtCreep(defender);
        if (!hurtCreep) {
            defender.idleNear(this.flag, 12);
            return;
        }

        // move to creep
        let range = defender.pos.getRangeTo(hurtCreep);
        if (range > 1) {
            defender.travelTo(hurtCreep, {movingTarget: true});
        } else {
            defender.yieldRoad(hurtCreep, true);
        }

        if (range === 1) {
            defender.heal(hurtCreep);
        } else if (range <= 3) {
            defender.rangedHeal(hurtCreep);
        }
    }

    protected findHurtCreep(defender: Agent) {
        if (!this.room) { return; }

        if (defender.memory.healId) {
            let creep = Game.getObjectById(defender.memory.healId) as Creep;
            if (creep && creep.room.name === defender.room.name && creep.hits < creep.hitsMax) {
                return creep;
            } else {
                defender.memory.healId = undefined;
                return this.findHurtCreep(defender);
            }
        } else if (!defender.memory.healCheck || Game.time - defender.memory.healCheck > 25) {
            defender.memory.healCheck = Game.time;
            let hurtCreep = _(this.room.find<Creep>(FIND_MY_CREEPS))
                .filter((c: Creep) => c.hits < c.hitsMax && c.ticksToLive > 100)
                .max((c: Creep) => c.partCount(WORK));

            if (hurtCreep instanceof Object) {
                defender.memory.healId = hurtCreep.id;
                return hurtCreep;
            }
        }
    }

    protected standardCartBody = () => {
        return this.bodyRatio(0, 2, 1);
    }
}

export type MissionMap = {[missionName: string]: Mission }
