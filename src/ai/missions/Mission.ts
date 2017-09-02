import {Operation} from "../operations/Operation";
import {SpawnGroup} from "../SpawnGroup";
import {FreelanceOptions, HeadCountOptions, TransportAnalysis} from "../../interfaces";
import {DESTINATION_REACHED, MAX_HARVEST_DISTANCE, MAX_HARVEST_PATH} from "../../config/constants";
import {helper} from "../../helpers/helper";
import {Agent} from "../agents/Agent";
import {ROOMTYPE_SOURCEKEEPER, WorldMap, ROOMTYPE_ALLEY} from "../WorldMap";
import {Traveler} from "../Traveler";
import {RoomHelper} from "../../helpers/RoomHelper";
import {empire} from "../Empire";
import {Scheduler} from "../../Scheduler";
import {Notifier} from "../../notifier";
import {CreepHelper} from "../../helpers/CreepHelper";
import {Profiler} from "../../Profiler";
import {TimeoutTracker} from "../../TimeoutTracker";
import {PaverMission} from "./PaverMission";

export interface MissionState {
    hasVision?: boolean;
    sources?: Source[];
    mineral?: Mineral;
    spawnedThisTick?: {[roleName: string]: string};
}

export interface MissionMemory {
    hc?: {[roleName: string]: string[]};
    activateBoost?: boolean;
    max?: number;
    distanceToSpawn?: number;
    transportAnalysis?: TransportAnalysis;
    storageId?: string;
    nextStorageCheck?: number;
    pathCheck?: number;
    pathDistance?: number;
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

    public static census: {[roomName: string]: {[missionName: string]: Mission}} = {};

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
        this.cache = {};

        // find state
        this.state = {} as MissionState;
        if (this.room) {
            this.state.hasVision = true;
            this.state.sources = this.operation.state.sources;
            this.state.mineral = this.operation.state.mineral;
        } else {
            this.state.hasVision = false;
        }

        this.state.spawnedThisTick = {};
    }

    private addToCensus() {
        if (!Mission.census[this.roomName]) { Mission.census[this.roomName] = {}; }
        Mission.census[this.roomName][this.name] = this;
    }

    /**
     * Init Phase - Used to initialize values on global update ticks
     */

    public baseInit() {
        try {
            this.initState();
            this.init();
            this.addToCensus();
        } catch (e) {
            Notifier.reportException(e, "init", this.roomName);
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
                // TimeoutTracker.log("update", mission.operation.name, mission.name, mission.roomName);
                // Profiler.start("upd.m." + missionName.substr(0, 3));
                mission.initState();
                mission.update();
                // Profiler.end("upd.m." + missionName.substr(0, 3));
            } catch (e) {
                Notifier.reportException(e, "update", mission.roomName);
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
                Notifier.reportException(e, "roleCall", mission.roomName);
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
                Notifier.reportException(e, "actions", mission.roomName);
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
                Notifier.reportException(e, "finalize", mission.roomName);
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

        // find creeps
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
                if (!creep.ticksToLive || creep.ticksToLive > ticksNeeded) {
                    count++;
                }
            } else {
                if (options.deathCallback && Memory.creeps[creepName]) {
                    options.deathCallback(roleName, Memory.creeps[creepName].oldAge > Game.time);
                }
                creepNames.splice(i, 1);
                delete Memory.creeps[creepName];
                i--;
            }
        }

        // manage freelancing
        if (options.freelance) {
            if (count < getMax()) {
                let creep = this.findFreelance(options.freelance);
                if (creep) {
                    creepArray.push(creep);
                    creepNames.push(creep.name);
                    count++;
                }
            } else if (options.freelance.noNewSpawn) {
                return creepArray;
            }
        }

        // manage spawning
        let allowSpawn = (this.spawnGroup.isAvailable || options.forceSpawn) && this.allowSpawn
            && (this.state.hasVision || options.blindSpawn);
        if (allowSpawn && count < getMax()) {
            let creepName = `${this.operation.name}_${roleName}_${Math.floor(Math.random() * 100)}`;
            let body = getBody();
            let outcome = this.spawnGroup.spawn(body, creepName, options.memory, options.reservation);
            if (_.isString(outcome)) {
                this.state.spawnedThisTick[roleName] = outcome;
                creepNames.push(creepName);
            }
        }

        return creepArray;
    }

    public findFreelance(options: FreelanceOptions): Creep {
        if (options.allowedRange === undefined) {
            options.allowedRange = 3;
        }

        for (let creepName in Memory.freelance) {
            let roleName = Memory.freelance[creepName];
            if (roleName !== options.roleName) { continue; }
            let creep = Game.creeps[creepName];
            if (creep) {
                let distance = Game.map.getRoomLinearDistance(options.roomName, creep.pos.roomName);
                if (distance > options.allowedRange) { continue; }
                if (distance * 100 > creep.ticksToLive) { continue; }
                if (options.requiredRating && CreepHelper.rating(creep) < options.requiredRating) { continue; }
                delete Memory.freelance[creepName];
                creep.say("found job", true);
                return creep;
            } else {
                delete Memory.freelance[creepName];
                delete Memory.creeps[creepName];
            }
        }
    }

    public goFreelance(agent: Agent, roleName: string) {
        let road = agent.pos.lookForStructure(STRUCTURE_ROAD);
        if (road) {
            agent.idleOffRoad();
            return;
        }

        let ticksLeft = agent.memory.freeTick - Game.time;
        if (ticksLeft <= 0 && ticksLeft > -10) {
            agent.say("find job", true);
            for (let previousRoleName in this.memory.hc) {
                let creepNames = this.memory.hc[previousRoleName];
                _.pull(creepNames, agent.name);
            }
            Memory.freelance[agent.name] = roleName;
        } else {
            if (ticksLeft > 0) {
                return;
            } else {
                agent.say("job done", true);
                agent.memory.freeTick = Game.time + 20;
            }
        }
    }

    protected deathNotify = (roleName: string, earlyDeath: boolean) => {
        if (earlyDeath) {
            Notifier.log(`RIP ${roleName} of ${this.operation.name} :'(`, 5);
        } else {
            Notifier.log(`RIP ${roleName} of ${this.operation.name} :')`, 1);
        }
    };

    protected spawnedThisTick(roleName: string): string {
        return this.state.spawnedThisTick[roleName];
    }

    public roleCount(roleName: string, filter?: (creep: Creep) => boolean): number {
        if (!this.memory.hc || !this.memory.hc[roleName]) { return 0; }
        if (!filter) { return this.memory.hc[roleName].length; }
        return _.filter(this.memory.hc[roleName] as string[], x => filter(Game.creeps[x])).length;
    }

    public roleCreeps(roleName: string): Creep[] {
        if (!this.memory.hc) { return []; }
        let creepNames = this.memory.hc[roleName];
        if (!creepNames) { return []; }
        let creeps = [];
        for (let creepName of creepNames) {
            let creep = Game.creeps[creepName];
            if (creep) { creeps.push(creep); }
        }
        return creeps;
    }

    protected swapRole(agent: Agent, fromRole: string, toRole: string) {
        console.log(`MISSION: ${agent.name} changed from ${fromRole} to ${toRole}`);
        _.pull(this.memory.hc[fromRole], agent.name);
        if (!this.memory.hc[toRole]) { this.memory.hc[toRole] = []; }
        this.memory.hc[toRole].push(agent.name);
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

    protected configBody(config: {[partType: string]: number}, moveLast = false, potency = 1): string[] {
        let body: string[] = [];

        if (moveLast) {
            for (let partType in config) {
                let amount = config[partType] * potency;
                if (partType === MOVE) {
                    amount--;
                }
                for (let i = 0; i < amount; i++) {
                    body.push(partType);
                }

            }
            body.push(MOVE);
        } else {
            for (let partType in config) {
                let amount = config[partType] * potency;
                for (let i = 0; i < amount; i++) {
                    body.push(partType);
                }
            }
        }
        return body;
    }

    protected configBody2(config: {part: string, count: number}[]): string[] {
        let body: string[] = [];
        for (let value of config) {
            let amount = value.count;
            for (let i = 0; i < amount; i++) {
                body.push(value.part);
            }
        }
        return body;
    }

    protected unitBody(unit: {[partType: string]: number}, options: UnitBodyOptions = {}): string[] {
        let additionalCost = 0;
        let additionalPartCount = 0;
        if (options.additionalParts) {
            additionalCost = SpawnGroup.calculateBodyCost(options.additionalParts);
            additionalPartCount = options.additionalParts.length;
        }
        options.potency = this.spawnGroup.maxUnits(this.configBody(unit), options.limit, additionalCost, additionalPartCount);
        if (options.potency === 0) {
            return;
        }

        let body = this.configBody(unit, options.moveLast, options.potency);
        if (options.additionalParts) {
            body = body.concat(options.additionalParts);
        }

        return body;
    }

    protected segmentBody(segments: string[], limit?: number): string[] {
        let potency = this.spawnGroup.maxUnits(segments, limit);
        if (potency <= 0) {
            return;
        }
        let body: string[] = [];
        let lastMove;
        for (let segment of segments) {
            let max = potency;
            if (segment === MOVE && !lastMove) {
                lastMove = MOVE;
                max--;
            }
            for (let i = 0; i < max; i++) {
                body.push(segment);
            }
        }
        if (lastMove) {
            body.push(lastMove);
        }

        return body;
    }

    /**
     * Returns creep body array with desired number of parts per unit in this order: WORK → CARRY → MOVE. Max units
     * automatically determined by available spawn energy up to limit
     * @param workCount
     * @param carryCount
     * @param moveCount
     * @param limit
     * @returns {string[]}
     */

    protected workerUnitBody(workCount: number, carryCount: number, moveCount: number, limit?: number) {
        return this.unitBody({[WORK]: workCount, [CARRY]: carryCount, [MOVE]: moveCount}, { limit: limit } );
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
     * @param offRoad
     * @returns {{body: string[], cartsNeeded: number}}
     */
    protected cacheTransportAnalysis(distance: number, load: number, offRoad = false): TransportAnalysis {
        if (!this.memory.transportAnalysis || load !== this.memory.transportAnalysis.load
            || distance !== this.memory.transportAnalysis.distance
            || this.spawnGroup.maxSpawnEnergy !== this.memory.transportAnalysis.maxSpawnEnergy) {
            this.memory.transportAnalysis = Mission.analyzeTransport(distance, load, this.spawnGroup.maxSpawnEnergy, offRoad);
        }
        return this.memory.transportAnalysis;
    }

    // deprecated
    public static analyzeTransport(distance: number, load: number, maxSpawnEnergy: number, offRoad = false): TransportAnalysis {
        // cargo units are just 2 CARRY, 1 MOVE, which has a capacity of 100 and costs 150
        distance = Math.max(distance, 1);
        let maxUnitsPossible = Math.min(Math.floor(maxSpawnEnergy /
            ((BODYPART_COST[CARRY] * 2) + BODYPART_COST[MOVE])), 16);
        let bandwidthNeeded = distance * load * 2.1;
        let cargoPartsPerUnit = 2;

        if (offRoad) {
            maxUnitsPossible = Math.min(Math.floor(maxSpawnEnergy /
                ((BODYPART_COST[CARRY]) + BODYPART_COST[MOVE])), 25);
            cargoPartsPerUnit = 1;
        }

        let cargoUnitsNeeded = Math.ceil(bandwidthNeeded / (CARRY_CAPACITY * cargoPartsPerUnit));
        let cartsNeeded = Math.ceil(cargoUnitsNeeded / maxUnitsPossible);
        let cargoUnitsPerCart = Math.floor(cargoUnitsNeeded / cartsNeeded);
        return {
            load: load,
            distance: distance,
            cartsNeeded: cartsNeeded,
            carryCount: cargoUnitsPerCart * cargoPartsPerUnit,
            moveCount: cargoUnitsPerCart,
            maxSpawnEnergy: maxSpawnEnergy,
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

    protected cachedStorage(pos: RoomPosition): StructureStorage {
        if (this.cache.storage) {
            return this.cache.storage;
        }

        let storage = this.getStorage(pos);
        this.cache.storage = storage;
        return storage;
    }

    protected getStorage(pos: RoomPosition): StructureStorage {

        let flag = Game.flags[`${this.operation.name}_storage`];
        if (flag && flag.room) {
            // could also return containers and terminals, make sure that is intended
            let structure = _(flag.pos.lookFor<StructureStorage>(LOOK_STRUCTURES)).filter(x => x.store).head();
            if (structure) { return structure; }
        }

        if (this.room.storage && this.room.storage.my && this.room.controller.level >= 4 && !this.room.memory.swap) {
            return this.room.storage;
        }

        // invalidated periodically
        if (!Scheduler.delay(this.memory, "nextStorageCheck", 10000)) {
            let nonSwaps = _.filter(empire.network.storages, x => !x.room.memory.swap);
            let bestStorages = RoomHelper.findClosest({pos: pos}, nonSwaps,
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
            if (creepName.indexOf(`${this.operation.name}_${roleName}_`) > -1) {
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

        if (options.deathCallback && !agent.creep.spawning && !agent.memory.oldAge) {
            agent.memory.oldAge = Game.time + agent.ticksToLive;
        }

        let boosted = agent.seekBoost(options.boosts, options.allowUnboosted);
        if (!boosted) { return false; }
        if (agent.creep.spawning) { return false; }

        let waypoints = this.operation.findOperationWaypoints();
        if (!options.skipWaypoints && waypoints.length > 0) {
            let waypointsCovered = agent.travelWaypoints(waypoints, {ensurePath: true}, true);
            if (!waypointsCovered) { return; }
        }

        if (!options.skipMoveToRoom && (agent.pos.roomName !== this.flag.pos.roomName || agent.pos.isNearExit(1))) {
            agent.avoidSK(this.flag, {ensurePath: true});
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

    protected medicActions(defender: Agent) {
        let hurtCreep = this.findHurtCreep(defender);
        if (!hurtCreep) {
            defender.idleNear(this.flag, 5);
            return false;
        }

        // move to creep
        let range = defender.pos.getRangeTo(hurtCreep);
        if (range > 1) {
            defender.travelTo(hurtCreep, {movingTarget: true, maxRooms: 1});
        } else {
            defender.yieldRoad(hurtCreep, true);
        }

        if (defender.hits < defender.hitsMax) {
            defender.heal(defender);
        } else if (range === 1) {
            defender.heal(hurtCreep);
        } else if (range <= 3) {
            defender.rangedHeal(hurtCreep);
        }
        return true;
    }

    protected findHurtCreep(defender: Agent) {
        if (defender.memory.healId) {
            let creep = Game.getObjectById(defender.memory.healId) as Creep;
            if (creep && creep.room.name === defender.room.name && creep.hits < creep.hitsMax) {
                return creep;
            } else {
                defender.memory.healId = undefined;
                return this.findHurtCreep(defender);
            }
        } else {
            if (defender.memory.nextHealCheck > Game.time) { return; }

            let hurtCreep = _(defender.room.find<Creep>(FIND_MY_CREEPS))
                .filter(x => x.hits < x.hitsMax && x.ticksToLive > 100 && CreepHelper.partCount(x, WORK) > 0)
                .min(x => x.pos.getRangeTo(defender));

            if (_.isObject(hurtCreep)) {
                defender.memory.healId = hurtCreep.id;
                return hurtCreep;
            } else {
                defender.memory.nextHealCheck = Game.time + 100;
            }
        }
    }

    protected standardCartBody = () => {
        return this.workerUnitBody(0, 2, 1);
    };

    protected notClaimed(obj: {id: string}, propName: string, agents: Agent[]): boolean {
        return !_.find(agents, x => x.memory[propName] === obj.id);
    }
}

export type MissionMap = {[missionName: string]: Mission }

export interface UnitBodyOptions {
    additionalParts?: string[];
    moveLast?: boolean;
    limit?: number;
    potency?: number;
}
