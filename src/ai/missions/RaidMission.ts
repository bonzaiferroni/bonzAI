import {Mission} from "./Mission";
import {
    RaidData, BoostLevel, RaidAction, RaidActionType, RaidMissionState, FleeType,
    FleeAnalysis, FleeDanger,
} from "../../interfaces";
import {Operation} from "../operations/Operation";
import {SpawnGroup} from "../SpawnGroup";
import {Agent} from "../agents/Agent";
import {ROOMTYPE_CORE, WorldMap} from "../WorldMap";
import {empire} from "../Empire";
import {notifier} from "../../notifier";
import {helper} from "../../helpers/helper";
import {RaidOperation} from "../operations/RaidOperation";
import {HostileAgent} from "../agents/HostileAgent";
import {traveler, TravelToOptions} from "../Traveler";
import {Viz} from "../../helpers/Viz";
import {Profiler} from "../../Profiler";
import {FireflyMission} from "./FireflyMission";
import {RAID_CREEP_MATRIX_COST} from "../../config/constants";
export abstract class RaidMission extends Mission {

    public spawned: boolean;

    protected attacker: Agent;
    protected healer: Agent;
    protected raidData: RaidData;
    protected raidOperation: RaidOperation;
    protected specialistPart: string;
    protected specialistBoost: string;
    protected spawnCost: number;
    protected raidWaypoints: Flag[];
    protected boostLevel: number;
    protected healerBoosts: string[];
    protected attackerBoosts: string[];
    protected attackRange: number;
    protected braveMode: boolean;
    protected state: RaidMissionState;

    public memory: {
        healerLead: boolean;
        spawned: boolean;
        hc: {[roleName: string]: string}
        chessMode: boolean;
        targetId: string;
        cache: any;
        altTargetIndex: number;
        targetPathCheck: number;
        lastFleeTick: number;
    };

    protected static cache: any;

    constructor(operation: RaidOperation, name: string, raidData: RaidData, spawnGroup: SpawnGroup, boostLevel: number,
                allowSpawn: boolean) {
        super(operation, name, allowSpawn);
        this.raidOperation = operation;
        this.raidData = raidData;
        this.spawnGroup = spawnGroup;
        this.boostLevel = boostLevel;
        if (!this.memory.cache) { this.memory.cache = {}; }
        if (!RaidMission.cache) { RaidMission.cache = {}; }
    }

    public initMission() {
        this.raidWaypoints = this.findRaidWaypoints();
        this.updateBoosts();
    }

    public roleCall() {
        let max = () => !this.memory.spawned ? 1 : 0;
        let reservation = { spawns: 2, currentEnergy: undefined };
        if (this.spawnGroup.maxSpawnEnergy >= this.spawnCost) {
            reservation.currentEnergy = this.spawnCost;
        }

        this.attacker = _.head(this.headCount(this.name + "Attacker", this.attackerBody, max, {
            memory: {boosts: this.attackerBoosts },
            reservation: reservation,
        }));

        if (this.attacker) {
            this.raidData.raidAgents.push(this.attacker);
            this.raidData.obstacles.push(this.attacker);
        }

        this.healer = _.head(this.headCount(this.name + "Healer", this.healerBody, max, {
            memory: { boosts: this.healerBoosts },
        }));

        if (this.healer) {
            this.raidData.raidAgents.push(this.healer);
        }
    }

    public missionActions() {

        /* ------PREPARE PHASE------ */
        // prep, wait for the other to boost
        let prepared = this.preparePhase();
        if (!prepared) { return; }

        // healing and attacking will be active from this point on
        this.state = this.findState();
        this.healCreeps(this.healer);

        let attackingCreep  = this.attackCreeps(this.attacker);
        let attackingStructure = this.attackStructure(this.attacker, attackingCreep);
        if ((!attackingCreep && !attackingStructure)
            || this.state.agentInDanger
            || this instanceof FireflyMission) {
            this.attacker.creep.cancelOrder("dismantle");
            this.attacker.creep.cancelOrder("attack");
            this.healCreeps(this.attacker);
        }

        // creeps report about situation
        this.raidTalk();

        /* ------TRAVEL PHASE------ */
        let waypointsTraveled = this.waypointSquadTravel(this.healer, this.attacker, this.raidWaypoints);
        if (!waypointsTraveled) {
            return;
        }

        /* --------FALLBACK-------- */
        let manualPositioning = this.manualPositioning(attackingCreep);
        if (manualPositioning) {
            return;
        }

        if (this.raidData.fallback) {
            this.squadTravel(this.healer, this.attacker, this.raidData.fallbackFlag);
            return;
        }

        /* --------SPECIAL-------- */
        try {
            Profiler.start("raid.spec");
            let maneuvering = this.specialActions();
            Profiler.end("raid.spec");
            if (maneuvering) { return; }
        } catch (e) {
            console.log(e.stack);
            this.raidOperation.memory.fallback = true;
            this.squadTravel(this.healer, this.attacker, this.raidData.fallbackFlag);
        }

        /* -------ENTRY PHASE------ */
        Profiler.start("raid.entr");
        let entrancing = this.entryActions();
        Profiler.end("raid.entr");
        if (entrancing) { return; }

        /* ------CLEAR PHASE------ */
        if (this.raidData.targetStructures && this.raidData.targetStructures.length > 0) {
            this.clearActions(attackingCreep);
            return;
        }

        if (!this.healer.memory.finishPhase) {
            this.healer.memory.finishPhase = true;
            console.log(`RAID: all structures cleared! (${this.operation.name} ${this.name})`);
        }

        /* ------FINISH PHASE------ */
        this.finishActions(attackingCreep);
    }

    public finalizeMission() {

        this.spawned = this.findSpawnedStatus();
        // console report
        if (Game.time % 10 === 0  && !this.spawned && this.allowSpawn) {
            console.log(`RAID: ${this.operation.name} ${this.name} squad ready (reservation)`);
        }
    }

    public invalidateMissionCache() {
    }

    public getSpecialAction(): RaidAction {
        if (!this.healer) { return; }
        return this.healer.memory.action;
    }

    public setSpecialAction(action: RaidAction) {
        if (!this.healer) { return; }
        let currentAction = this.getSpecialAction();
        if (currentAction) {
            this.healer.say(`${currentAction.type} to ${action ? action.type : "none"}`);
        } else if (action) {
            this.healer.say(`do ${action.type}`);
        }
        this.healer.memory.action = action;
    }

    protected entryActions(): boolean {
        if (this.state.bothInRoom && this.state.neitherOnExit) {
            return false;
        }

        if (this.state.inSameRoom && (!this.state.together || this.state.fatigued)) {
            this.attacker.travelTo(this.healer);
            return true;
        }

        if (this.state.bothOnExit && this.state.bothInRoom) {
            this.attacker.moveOffExit();
            this.healer.moveOffExit();
            return true;
        }

        if (this.state.bothInRoom && this.healer.rangeToEdge === 1 && this.attacker.pos.isNearExit(0)) {
            let healerPos = this.healer.pos.openAdjacentSpots()[0];
            if (healerPos) {
                this.healer.travelTo(healerPos);
                this.attacker.travelTo(this.healer);
                return true;
            }
        }

        let attackerPosition = this.attacker.nearbyExit();
        let healerPosition = this.healer.nearbyExit();
        if (this.state.neitherInRoom && this.state.bothNearExit && attackerPosition && healerPosition
            && !attackerPosition.inRangeTo(healerPosition, 0)) {
            this.attacker.travelTo(attackerPosition);
            this.healer.travelTo(healerPosition);
            return true;
        }

        if (this.state.neitherInRoom && this.healer.rangeToEdge === 1 && this.attacker.rangeToEdge === 2) {
            let attackerPos = _(this.attacker.pos.openAdjacentSpots())
                .filter((x: RoomPosition) => {
                    if (!x.isPassible() || !x.isNearTo(this.healer)) {
                        return false;
                    }
                    let directions = [1, 3, 5, 7];
                    for (let direction of directions) {
                        let pos = x.getPositionAtDirection(direction);
                        if (pos.isNearExit(0) && Game.map.getTerrainAt(pos) !== "wall") {
                            return true;
                        }
                    }
                }).head();
            if (attackerPos) {
                this.attacker.travelTo(attackerPos);
                return true;
            }
        }

        let destination = this.raidData.targetFlags[0];
        if (!destination) {
            destination = this.raidData.attackFlag;
        }

        this.squadTravel(this.healer, this.attacker, destination);
        return true;
    }

    protected clearActions(attackingCreep) {
        let target = this.findMissionTarget();

        if (!target) {
            console.log(`couldn't find target! ${this.raidData.attackRoom}`);
            return;
        }

        if (this.attacker.pos.inRangeTo(target, this.attackRange)) {
            if (target.pos.lookFor(LOOK_TERRAIN)[0] !== "swamp") {
                this.squadTravel(this.attacker, this.healer, target);
            }
        } else {
            this.squadTravel(this.attacker, this.healer, target);
        }
    }

    protected finishActions(attackingCreep: boolean) {
        // TODO: add more interesting rating based on raid stats
        let signText = this.operation.memory.signText ||
            "this room has been inspected by bonzAI and given the following rating: ouch+";
        let sign = this.raidData.attackRoom.controller.sign;
        if (!sign || sign.text !== signText) {
            console.log(this.raidData.attackRoom.controller);
            this.squadTravel(this.attacker, this.healer, this.raidData.attackRoom.controller);
            this.attacker.creep.signController(this.attacker.room.controller, signText);
            return;
        }
        this.squadTravel(this.healer, this.attacker, this.raidData.attackFlag);
    }

    /**
     * This will handle squad movement for the raid, using the cached matrix in the attack room and adding other raid
     * creeps as obstacles so they do not try to path through each other
     * @param leader
     * @param follower
     * @param destination
     * @param options
     */
    protected squadTravel(leader: Agent, follower: Agent, destination: {pos: RoomPosition}, options?: TravelToOptions) {
        if (!options) {
            options = {};
        }

        if (!options.roomCallback) {
            options.roomCallback = (roomName: string, matrix: CostMatrix) => {
                if (roomName === this.raidData.attackFlag.pos.roomName) {
                    return this.raidData.raidMatrix;
                }
            };
        }

        if (leader.room && follower.room === this.raidData.attackRoom) {
            if (!leader.pos.isNearExit(0)) {
                // creeps repath every other tick (on average) in room
                options.repath = 1;
            }
            options.ignoreRoads = true;
            options.maxRooms = 1;
            options.useFindRoute = false;
        }

        if (options.range === undefined && leader === this.attacker && this.state.bothInRoom
            && this.state.neitherOnExit) {
            options.range = this.attackRange;
        }

        options.returnData = { nextPos: undefined };
        Agent.squadTravel(leader, follower, destination, options);
        let nextPos = options.returnData.nextPos;
        this.updateMatrixForSquad(nextPos, leader.pos, follower.pos);
    }

    protected waypointSquadTravel(healer: Agent, attacker: Agent, waypoints: Flag[]): boolean {
        if (healer.memory.waypointsCovered) {
            return true;
        }

        if (healer.memory.waypointIndex === undefined) {
            healer.memory.waypointIndex = 0;
        }

        if (healer.memory.waypointIndex >= waypoints.length) {
            healer.memory.waypointsCovered = true;
            return true;
        }

        let leader = attacker;
        let follower = healer;
        if (this.memory.healerLead) {
            leader = healer;
            follower = attacker;
        }

        let waypoint = waypoints[healer.memory.waypointIndex];
        if (WorldMap.roomTypeFromName(waypoint.pos.roomName) === ROOMTYPE_CORE) {
            let squadCrossing = this.squadPortalTravel(healer, attacker, waypoint);
            if (squadCrossing) { return false; }
        }

        if (waypoint.room && leader.pos.inRangeTo(waypoint, 5) && !leader.pos.isNearExit(0) ) {
            console.log(`RAID: waypoint ${healer.memory.waypointIndex} reached (${this.operation.name} ${this.name})`);
            healer.memory.waypointIndex++;
        }

        this.squadTravel(leader, follower, waypoint);
    }

    /**
     * To travel by portal, make sure there is a waypoint flag on a portal tile
     * @param healer
     * @param attacker
     * @param waypoint
     * @returns {boolean}
     */
    private squadPortalTravel(healer: Agent, attacker: Agent, waypoint: Flag): boolean {
        if (!healer.memory.portalCrossing && (!waypoint.room || !waypoint.pos.lookForStructure(STRUCTURE_PORTAL))) {
            return false;
        }
        healer.memory.portalCrossing = true;
        let healerCrossed = this.portalTravel(healer, waypoint);
        let attackerCrossed = this.portalTravel(attacker, waypoint);
        if (healerCrossed && attackerCrossed) {
            healer.memory.portalCrossing = false;
            healer.memory.waypointIndex++;
            return false;
        } else {
            return true;
        }
    }

    /**
     * try to keep creeps a respectable distance from healer (range === 4) without interfering with other raid behavior
     * @param fleeRange
     * @param keepAtRange
     * @returns {boolean}
     */

    protected squadFlee(): boolean {
        if (this.state.fatigued || !this.state.together) {
            if (Game.time === this.memory.lastFleeTick + 1) {
                this.attacker.travelTo(this.healer);
                return true;
            } else {
                return false;
            }
        }

        let chasers = _(HostileAgent.findInRoom(this.healer.pos.roomName))
            .filter(x => x.getPotential(ATTACK) > 300 || x.getPotential(RANGED_ATTACK) > 300)
            .value();

        if (chasers.length === 0) {
            return false;
        }

        let analysis = this.fleeAnalysis2(chasers);
        if (analysis.fleeType === FleeType.SafeToTravel) {
            return false;
        }

        if (analysis.fleeType === FleeType.KeepAtRange) {
            return true;
            /*if (this.attackRange > 1 || Game.time === this.memory.lastFleeTick + 1) {
                return true;
            } else {
                return false;
            }*/
        }

        if (analysis.fleeType === FleeType.SingleMove) {
            analysis.singleMover.move(analysis.singleMoveDirection);
            let position = analysis.singleMover.pos.getPositionAtDirection(analysis.singleMoveDirection);
            this.updateMatrix(position, RAID_CREEP_MATRIX_COST);
            this.updateMatrix(analysis.singleMover.pos, -RAID_CREEP_MATRIX_COST);
            return true;
        }

        let leader = this.healer;
        let follower = this.attacker;
        if (analysis.attackerLeads) {
            leader = this.attacker;
            follower = this.healer;
        }

        this.memory.lastFleeTick = Game.time;
        let rangeMap = _.map(chasers, (x: {pos: RoomPosition}) => { return {pos: x.pos, range: 10 }; });
        let ret = PathFinder.search(this.healer.pos, rangeMap, {
            flee: true,
            maxRooms: 1,
            roomCallback: (roomName: string) => {
                let room = Game.rooms[roomName];
                if (!room) { return; }
                if (roomName === this.raidData.attackFlag.pos.roomName) {
                    return this.raidData.raidMatrix;
                } else {
                    return traveler.getStructureMatrix(room);
                }
            },
        });
        let color = "green";
        if (ret.incomplete) {
            color = "red";
        }
        Viz.showPath(ret.path, color);
        if (ret.path.length > 0 && !ret.path[0].isNearExit(0)) {
            leader.travelTo(ret.path[0]);
            follower.travelTo(leader);
            this.updateMatrixForSquad(ret.path[0], leader.pos, follower.pos);
        }
        Viz.colorPos(this.attacker.pos, "red");
        return true;
    }

    private fleeAnalysis(chasers: HostileAgent[]): FleeAnalysis {
        let fleeRange = 3;

        let closestToHealer = this.healer.pos.getRangeToClosest(chasers);
        let closestToAttacker = this.attacker.pos.getRangeToClosest(chasers);
        let rangeToClosest = Math.min(closestToHealer, closestToAttacker);
        let approachingHostiles = _(chasers)
            .filter(x => x.pos.inRangeTo(this.healer, 5))
            .filter(x => x.isApproaching(this.healer))
            .sortBy(x => x.pos.getRangeTo(this.healer))
            .value();

        let analysis: FleeAnalysis = {
            fleeType: FleeType.SafeToTravel,
            closestToHealer: closestToHealer,
            closestToAttacker: closestToAttacker,
            rangeToClosest: rangeToClosest,
        };

        // case: chasers very close
        if (rangeToClosest <= 2) {
            analysis.fleeType = FleeType.Flee;
            if (closestToHealer < closestToAttacker) {
                // ahc...
                // 101234

                // ah.c..
                // 101234
                analysis.attackerLeads = true;
            }
            return analysis;
        }

        /*if (rangeToClosest <= fleeRange) {
            if (this.attackRange >= 3 || approachingHostiles.length > 0) {
                return {
                    fleeType: FleeType.Flee,
                };
            } else {
                return {
                    fleeType: FleeType.KeepAtRange,
                };
            }
        }

        if (rangeToClosest === fleeRange) {
            if (approachingHostiles.length > 0) {
                // retu
            }
        }

        return { fleeType: FleeType.Flee };*/
    }

    private fleeAnalysis2(chasers: HostileAgent[]): FleeAnalysis {
        let fleeRange = 3;

        let closestToHealer = this.healer.pos.getRangeToClosest(chasers);
        let closestToAttacker = this.attacker.pos.getRangeToClosest(chasers);
        let rangeToClosest = Math.min(closestToHealer, closestToAttacker);
        let analysis: FleeAnalysis = {
            fleeType: FleeType.SafeToTravel,
            closestToHealer: closestToHealer,
            closestToAttacker: closestToAttacker,
            rangeToClosest: rangeToClosest,
        };

        // don't move closer if nearly at range and closest seems to be moving toward you
        if (closestToAttacker === fleeRange + 1 && closestToHealer > fleeRange) {
            if (!this.attacker.memory.delayFlee) {
                Viz.colorPos(this.attacker.pos, "yellow", .2);
                this.attacker.memory.delayFlee = true;
                analysis.fleeType = FleeType.KeepAtRange;
                return analysis;
            }
        }
        this.attacker.memory.delay = false;

        // should be safe
        if (rangeToClosest > fleeRange) {
            Viz.colorPos(this.attacker.pos, "green", .4);
            analysis.fleeType = FleeType.SafeToTravel;
            return analysis;
        }

        // this is meant to keep the creeps stationary if they are at the desired range, rather than yoyoing
        if (rangeToClosest === fleeRange) {
            Viz.colorPos(this.attacker.pos, "yellow", .4);
            analysis.fleeType = FleeType.KeepAtRange;
            return analysis;
        }

        analysis.fleeType = FleeType.Flee;
        return analysis;
    }

    private portalTravel(agent: Agent, waypoint: Flag): boolean {
        if (Game.map.getRoomLinearDistance(agent.pos.roomName, waypoint.pos.roomName) > 5) {
            // other side
            if (agent.pos.lookForStructure(STRUCTURE_PORTAL)) {
                let positions = agent.pos.openAdjacentSpots(false);
                if (positions.length > 0) {
                    console.log(agent.name + " stepping off portal");
                    agent.travelTo(positions[0]);
                    return;
                }
            }
            // console.log(agent.name + " waiting on other side");
            return true;
        } else {
            // console.log(agent.name + " traveling to waypoint");
            agent.travelTo(waypoint);
        }
    }

    protected healerBody = (): string[] => {
        if (this.boostLevel === BoostLevel.Training) {
            return this.configBody({ [TOUGH]: 1, [MOVE]: 2, [HEAL]: 1 });
        } else if (this.boostLevel === BoostLevel.Unboosted) {
            return this.configBody({ [TOUGH]: 5, [MOVE]: 25, [HEAL]: 20 });
        } else if (this.boostLevel === BoostLevel.SuperTough) {
            return this.configBody({ [TOUGH]: 16, [MOVE]: 10, [HEAL]: 24 });
        } else if (this.boostLevel === BoostLevel.RCL7) {
            return this.configBody({ [TOUGH]: 12, [MOVE]: 8, [HEAL]: 20 });
        } else { // this.boostLevel === BoostLevel.Boosted (this is recommended)
            return this.configBody({ [TOUGH]: 10, [MOVE]: 10, [HEAL]: 30 });
        }
    };

    protected attackerBody = (): string[] => {
        if (this.boostLevel === BoostLevel.Training) {
            return this.configBody({ [TOUGH]: 1, [MOVE]: 3, [this.specialistPart]: 1, [RANGED_ATTACK]: 1 });
        } else if (this.boostLevel === BoostLevel.Unboosted) {
            return this.configBody({ [TOUGH]: 5, [MOVE]: 25, [this.specialistPart]: 19, [RANGED_ATTACK]: 1 });
        } else if (this.boostLevel === BoostLevel.SuperTough) {
            return this.configBody({ [TOUGH]: 16, [MOVE]: 10, [this.specialistPart]: 18, [RANGED_ATTACK]: 1,
                [HEAL]: 5 });
        } else if (this.boostLevel === BoostLevel.RCL7) {
            return this.configBody({ [TOUGH]: 12, [MOVE]: 8, [this.specialistPart]: 19, [RANGED_ATTACK]: 1 });
        } else { // this.boostLevel === BoostLevel.Boosted (this is recommended)
            return this.configBody({ [TOUGH]: 12, [MOVE]: 10, [this.specialistPart]: 27, [RANGED_ATTACK]: 1 });
        }
    };

    private healCreeps(agent: Agent) {
        if (agent.getPotential(HEAL) === 0) { return; }

        let creepsInRange = _(agent.pos.findInRange<Creep>(FIND_MY_CREEPS, 3))
            .filter(x => x.hits < x.hitsMax)
            .value();
        let hurtcreeps = _(creepsInRange)
            .filter((x: Creep) => {
                if (!x.hitsTemp) { x.hitsTemp = x.hits; }
                return x.hitsTemp < x.hitsMax;
            })
            .sortBy(x => x.hitsTemp)
            .value();

        let mostHurtNearby = _(hurtcreeps).filter(x => x.pos.isNearTo(agent)).head();
        if (mostHurtNearby && mostHurtNearby.hitsMax - mostHurtNearby.hitsTemp > 400) {
            agent.heal(mostHurtNearby);
            mostHurtNearby.hitsTemp += agent.getPotential(HEAL);
            return;
        }

        let mostHurt = _(hurtcreeps).head();
        if (!mostHurt) {
            mostHurt = _(creepsInRange).sortBy(x => x.hits).head();
        }

        if (!mostHurt) {
            agent.heal(this.attacker);
            return;
        }

        if (mostHurt.pos.isNearTo(agent)) {
            agent.heal(mostHurt);
            mostHurt.hitsTemp += agent.getPotential(HEAL);
        } else {
            agent.rangedHeal(mostHurt);
            mostHurt.hitsTemp += agent.getPotential(HEAL) / 3;
        }
    }

    protected attackCreeps(attacker: Agent): boolean {

        let creepTargets = _(attacker.pos.findInRange(attacker.room.hostiles, 3))
            .filter((c: Creep) => _.filter(c.pos.lookFor(LOOK_STRUCTURES),
                (s: Structure) => s.structureType === STRUCTURE_RAMPART).length === 0)
            .sortBy("hits")
            .value();

        if (creepTargets.length === 0) {
            return false;
        }

        let closest = attacker.pos.findClosestByRange(creepTargets);
        let range = attacker.pos.getRangeTo(closest);

        if (range === 1 || attacker.massAttackDamage() >= 10) {
            attacker.rangedMassAttack();
        } else {
            attacker.rangedAttack(closest);
        }

        if (range === 1 && attacker.partCount(ATTACK)) {
            let hostileAgent = new HostileAgent(closest);
            if (hostileAgent.getPotential(ATTACK) * 2 < attacker.shield
                || attacker.hits === attacker.hitsMax) {
                attacker.attack(closest);
            }
            return true;
        }

        if (attacker.partCount(RANGED_ATTACK) > 1) {
            return true;
        }
    }

    protected attackStructure(attacker: Agent, attackingCreep: boolean) {

        let target = attacker.pos.findClosestByRange(this.raidData.targetStructures);
        if (!target || !target.pos.inRangeTo(attacker, this.attackRange)) {
            if (attacker.room !== this.raidData.attackRoom) { return; }
            /*target = _(attacker.pos.findInRange(attacker.room.findStructures<StructureRampart>(STRUCTURE_RAMPART),
                this.attackRange))
                .sortBy(x => x.hits)
                .head();*/
        }

        if (!target) {
            return;
        }

        attacker.dismantle(target);
        if (!attackingCreep) {
            let range = attacker.pos.getRangeTo(target);
            if (range === 1) {
                attacker.attack(target);
                attacker.rangedMassAttack();
                return true;
            } else if (range <= 3) {
                attacker.rangedAttack(target);
            } else if (attacker.room === this.raidData.attackRoom) {
                attacker.massAttackDamage();
            }
        }
    }

    private preparePhase() {
        if (this.attacker && !this.healer) {
            this.healCreeps(this.attacker);
            let closest = this.attacker.pos.findClosestByRange(this.room.hostiles);
            if (closest) {
                let range = this.attacker.pos.getRangeTo(closest);
                if (range <= this.attackRange) {
                    this.attacker.attack(closest);
                    this.attacker.rangedAttack(closest);
                    if (range < this.attackRange) {
                        this.attacker.retreat([closest]);
                    }
                } else {
                    this.attacker.travelTo(closest);

                }
            } else if (this.attacker.room === this.raidData.attackRoom) {
                let closest = this.attacker.pos.findClosestByRange<Structure>(this.raidData.targetStructures);
                if (closest) {
                    if (this.attacker.pos.inRangeTo(closest, this.attackRange)) {
                        this.attacker.dismantle(closest);
                        this.attacker.attack(closest);
                        this.attacker.rangedMassAttack();
                    } else {
                        this.attacker.travelTo(closest);
                    }
                }
            } else {
                this.attacker.idleOffRoad(this.flag);
            }
        }

        if (this.healer && !this.attacker) {
            this.healCreeps(this.healer);
            this.healer.idleOffRoad(this.flag);
        }

        return this.attacker && this.healer;
    }

    private raidTalk() {

        /* if (this.attacker.hits < this.attacker.hitsMax) {
            this.attacker.say("" + this.attacker.hits);
        }

        if (this.healer.hits < this.healer.hitsMax) {
            this.healer.say("" + this.healer.hits);
        }*/
    }

    private findMissionTarget() {
        if (this.memory.targetId) {
            let target = Game.getObjectById<{pos: RoomPosition, id: string}>(this.memory.targetId);
            if (target && Game.time < this.memory.targetPathCheck) {
                return target;
            } else {
                delete this.memory.targetId;
                return this.findMissionTarget();
            }
        } else {
            let bestTarget = _(this.raidData.targetStructures)
                .sortBy(x => x.pos.getRangeTo(this.attacker))
                .find(x => this.hasValidPath(this.attacker, x));
            if (!bestTarget) {
                bestTarget = this.findAlternateTarget();
            }

            if (bestTarget) {
                this.memory.targetPathCheck = Game.time + 100;
                this.memory.targetId = bestTarget.id;
                return bestTarget;
            }
        }
    }

    protected findAlternateTarget(): Structure {
        let ramparts = _(this.raidData.attackRoom.findStructures<StructureRampart>(STRUCTURE_RAMPART))
            .sortBy(x => x.hits).value();
        if (this.memory.altTargetIndex === undefined || this.memory.altTargetIndex > ramparts.length) {
            this.memory.altTargetIndex = 0;
        }

        if (!RaidMission.cache.altTargetExclude) { RaidMission.cache.altTargetExclude = {}; }
        let cpu = Game.cpu.getUsed();
        let cpuUsed = 0;
        while (this.memory.altTargetIndex < ramparts.length && cpuUsed < 2000) {
            let target = ramparts[this.memory.altTargetIndex++];
            if (RaidMission.cache.altTargetExclude[target.id]) { continue; }
            if (this.hasValidPath(this.attacker, target)) {
                console.log(`found alt target at ${target.pos}`);
                return target;
            }
            RaidMission.cache.altTargetExclude[target.id] = true;
            cpuUsed += Game.cpu.getUsed() - cpu;
        }
    }

    protected hasValidPath(origin: {pos: RoomPosition}, destination: {pos: RoomPosition}, maxOps = 4000): boolean {
        if (!origin || !destination) { return; }
        let options: TravelToOptions = {maxOps: maxOps, maxRooms: 1 };
        options.range = this.attackRange;
        let ret = empire.traveler.findTravelPath(origin, destination, options);
        return !ret.incomplete;
    }

    public findSpawnedStatus(): boolean {
        if (!this.memory.spawned && this.roleCount(this.name + "Attacker") > 0
            && this.roleCount(this.name + "Healer") > 0) {
            this.memory.spawned = true;
        }
        if (this.memory.spawned && this.roleCount(this.name + "Attacker") === 0
            && this.roleCount(this.name + "Healer") === 0) {
            this.memory.spawned = false;
        }
        return this.memory.spawned;
    }

    private updateBoosts() {
        if (this.boostLevel === BoostLevel.Training || this.boostLevel === BoostLevel.Unboosted) {
            this.healerBoosts = [];
            this.attackerBoosts = [];
        } else {
            this.healerBoosts = [
                RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE,
                RESOURCE_CATALYZED_GHODIUM_ALKALIDE,
                RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE];
        }
    }

    private findRaidWaypoints(): Flag[] {
        let waypoints = this.getFlagSet("_waypoints_", 15);
        waypoints.push(this.raidData.fallbackFlag);
        return waypoints;
    }

    private manualPositioning(attackingCreep: boolean): boolean {
        let attackPosFlag = Game.flags[`${this.operation.name}_${this.name}_attacker`];
        let healerPosFlag = Game.flags[`${this.operation.name}_${this.name}_healer`];
        if (!attackPosFlag && !healerPosFlag) { return false; }

        if (healerPosFlag && !attackPosFlag) {
            let fleeing = this.squadFlee();
            if (fleeing) { return true; }

            this.squadTravel(this.healer, this.attacker, healerPosFlag, {range: 0});
            return true;
        }

        if (attackPosFlag && !healerPosFlag) {
            if (!this.operation.memory.braveMode) {
                let fleeing = this.squadFlee();
                if (fleeing) { return true; }
            }

            let range = 0;
            if (attackPosFlag.room) {
                let structure = attackPosFlag.pos.lookFor<Structure>(LOOK_STRUCTURES)[0];
                if (structure) {
                    range = this.attackRange;
                    if (this.attacker.pos.inRangeTo(structure, 3) && !attackingCreep) {
                        this.attacker.rangedAttack(structure);
                        this.attacker.attack(structure);
                    }
                }
            }

            this.squadTravel(this.attacker, this.healer, attackPosFlag, {range: range});
            return true;
        }

        this.attacker.travelTo(attackPosFlag);
        if (healerPosFlag.room !== this.raidData.attackRoom
            && this.attacker.room === this.raidData.attackRoom && this.healer.room === this.raidData.attackRoom) {
            // move attacker out of attack room first
            return true;
        }

        this.healer.travelTo(healerPosFlag);
        return true;
    }

    /**
     * Default special actions involve dealing with danger
     * @returns {boolean}
     */

    protected specialActions() {
        this.findSpecialAction();
        let action = this.getSpecialAction();
        if (!action) { return false; }
        this.processAction(action);
        return true;
    }

    private processAction(action: RaidAction) {
        let color: string;
        switch (action.type) {
            case RaidActionType.Wallflower:
                color = "blue";
                this.wallflowering();
                break;
            case RaidActionType.LurkOutside:
                color = "blue";
                this.lurking();
                break;
            case RaidActionType.Retreat:
                color = "red";
                this.retreating();
                break;
            case RaidActionType.EdgeScoot:
                color = "blue";
                this.edgeScooting();
                break;
            case RaidActionType.Headhunter:
                color = "aqua";
                this.headhunting();
                break;
            default:
                break;
        }
        new RoomVisual(this.attacker.pos.roomName).circle(this.attacker.pos, {fill: color});
        new RoomVisual(this.healer.pos.roomName).circle(this.healer.pos, {fill: color});
    }

    private findSpecialAction() {

        let currentAction = this.getSpecialAction();

        if (this.raidData.nextNuke < 80 &&
            (!currentAction || !currentAction.endAtTick
            || currentAction.endAtTick < Game.time + this.raidData.nextNuke)) {
            console.log("bugging out due to nuke!");
            this.setSpecialAction({
                type: RaidActionType.Retreat,
                endAtTick: Game.time + this.raidData.nextNuke,
            });
            return;
        }

        // nothing should override a retreat order
        if (currentAction && currentAction.type === RaidActionType.Retreat) { return; }

        // both are near death, time to retreat
        /* if (this.attacker.shield === 0 || this.healer.shield === 0) {
            console.log(`start retreat!`);
            this.setSpecialAction({
                type: RaidActionType.Retreat,
            });
            return;
        }*/

        /*-- These actions can overwrite an existing action (like headhunter) --*/

        // handle situations that occur within the attack room
        let totalCreepsInRoom = 0;
        if (this.raidData.attackRoom) {
            totalCreepsInRoom = this.raidData.attackRoom.find(FIND_MY_CREEPS).length;
        }

        /*if (agentInDanger && areTogether && bothOnExit && noFatigue) {
            console.log(`start lurking!`);
            this.setSpecialAction({
                type: RaidActionType.LurkOutside,
                endAtTick: Game.time + 5,
            });
            return;
        }*/

        /*if (agentInDanger && areTogether && bothNearExit && noFatigue) {
            console.log(`start wallflowering!`);
            this.setSpecialAction({
                type: RaidActionType.Wallflower,
            });
            return;
        }*/

        /*if (totalCreepsInRoom < 6 && this.state.atLeastOneInRoom && this.state.agentInDanger) {
            console.log(`start retreat!`);
            this.setSpecialAction({
                type: RaidActionType.Retreat,
            });
            return;
        }*/

        if (currentAction) { return; } // the following will only activate if there isn't a current action

        // handle headhunting
        // this will currently break most raids, could trigger headhunter even when there is no path to creep
        // TODO: handle case where there is no path to headhunted creeps
        if (this.state.together && this.state.neitherOnExit) {
            let towers;
            if (this.raidData.attackRoom) {
                towers = this.raidData.attackRoom.findStructures<StructureTower>(STRUCTURE_TOWER);
            }
            let hostileAgents = _(HostileAgent.findInRoom(this.attacker.room.name))
                .filter(h => !h.pos.isNearExit(1))
                .filter(h => !h.pos.lookForStructure(STRUCTURE_RAMPART))
                .filter(h => !towers || h.pos.getRangeToClosest(towers) > 20)
                .value();
            if (hostileAgents.length > 0) {
                let action = this.getHeadhunterAction(hostileAgents);
                if (action) {
                    this.setSpecialAction(action);
                }
            }
        }
    }

    private getExpectedDamage(agent: Agent): number {
        let hostileAgents = HostileAgent.findInRoom(this.healer.room.name);
        let hostileDamage = 0;
        for (let hostileAgent of hostileAgents) {
            // consider how much damage it would be if the creep moved toward us next tick
            let rangeNextTick = agent.pos.getRangeTo(hostileAgent) - 1;
            hostileDamage += hostileAgent.expectedDamageAtRange(rangeNextTick);
        }
        let towerDamage = helper.towerDamageAtPosition(agent.pos,
            agent.room.findStructures<StructureTower>(STRUCTURE_TOWER));

        let totalDamage = hostileDamage + towerDamage;
        if (this.braveMode && this.healer.hits > this.healer.hitsMax * .9) {
            totalDamage -= this.healer.getPotential(HEAL);
        }

        return totalDamage;
    }

    private isInDanger(agent: Agent) {
        return this.getExpectedDamage(agent) > agent.shield;
    }

    private wallflowering() {
        let validConditions = this.attacker.room !== this.healer.room || !this.attacker.pos.isNearTo(this.healer)
            || !this.healer.pos.isNearExit(1) || !this.attacker.pos.isNearExit(1)
            && this.attacker.shield > 0 && this.healer.shield > 0;

        if (!validConditions) {
            console.log(`RAID: switching from wallflower to retreat: ${this.raidData.attackFlag.pos.roomName}`);
            this.setSpecialAction({ type: RaidActionType.Retreat });
            this.processAction(this.getSpecialAction()); // change action
        }

        if (this.healer.room === this.raidData.attackRoom) {
            if (this.attacker.rangeToEdge === 1 && this.healer.rangeToEdge === 1) {
                this.attacker.moveOnExit();
                this.healer.moveOnExit();
            } else {
                // just sit there for now
            }
        } else {
            // just sit there for now
        }
    }

    private lurking() {
        let validConditions = this.attacker.room !== this.healer.room || !this.attacker.pos.isNearTo(this.healer)
            || !this.healer.pos.isNearExit(1) || !this.attacker.pos.isNearExit(1)
            && this.attacker.room !== this.raidData.attackRoom;

        if (!validConditions) {
            console.log(`RAID: switching from lurking to retreat: ${this.raidData.attackFlag.pos.roomName}`);
            this.setSpecialAction({ type: RaidActionType.Retreat });
            this.processAction(this.getSpecialAction()); // change action
        }

        if (Game.time >= this.getSpecialAction().endAtTick) {
            console.log(`RAID: lurk timer is complete, resuming`);
            this.setSpecialAction(undefined);
        }

        if (this.healer.room === this.raidData.attackRoom) { return; }
        if (this.healer.pos.isNearExit(0)) {
            this.healer.moveOffExit(false);
            this.attacker.moveOffExit(false);
        }
    }

    private retreating() {
        let action = this.getSpecialAction();

        if (this.healer.pos.inRangeTo(this.raidData.fallbackFlag, 0) && this.healer.hits === this.healer.hitsMax) {
            if (!action.endAtTick ||  Game.time > action.endAtTick) {
                console.log("ending retreat (timeout)");
                this.healer.memory.endRetreat = undefined;
                this.setSpecialAction(undefined);
            }

            return;
        }

        if (action.endAtTick === undefined && this.healer.hits === this.healer.hitsMax
            && this.attacker.hits === this.attacker.hitsMax) {
            this.setSpecialAction(undefined);
            return;
        }

        // simultaneous move off exit
        let success = this.retreatMoveOffExit();
        if (success) { return; }

        // simultaneous move on exit
        success = this.retreatMoveOnExit();
        if (success) { return; }

        // move into good exiting positing
        success = this.retreatExitPositioning();
        if (success) { return; }

        success = this.retreatHeadHunting();
        if (success) { return; }

        this.squadTravel(this.healer, this.attacker, this.raidData.fallbackFlag);
    }

    private retreatHeadHunting() {
        if (this.healer.room === this.raidData.attackRoom || this.attacker.room === this.raidData.attackRoom) {
            return false;
        }

        if (this.healer.pos.isNearExit(0) || this.attacker.pos.isNearExit(0)) {
            return false;
        }

        let hostilesInRange = this.healer.pos.findInRange(HostileAgent.findInRoom(this.healer.room.name), 10);
        if (hostilesInRange.length > 0) {
            let action = this.getHeadhunterAction(hostilesInRange);
            if (!action) {
                return false;
            } else {
                this.setSpecialAction(action);
                this.processAction(action);
                return true;
            }
        }
    }

    private retreatMoveOffExit(): boolean {
        if (this.state.bothInRoom) {
            return false;
        }

        if (!this.state.bothOnExit) {
            return false;
        }

        if (!this.state.together) {
            return false;
        }

        if (this.state.fatigued) {
            return true;
        }

        this.healer.moveOffExit();
        this.attacker.moveOffExit();
        return true;
    }

    private retreatMoveOnExit(): boolean {
        if (this.state.neitherInRoom) {
            return false;
        }

        if (!this.state.bothNearExit) {
            return false;
        }

        if (!this.state.together) {
            return false;
        }

        if (this.state.fatigued) {
            return true;
        }

        let closestHostile = this.healer.pos.findClosestByRange(HostileAgent.findInRoom(this.healer.room.name));
        let healerPos = this.healer.nearbyExit(closestHostile);
        let attackerPos = this.attacker.nearbyExit(closestHostile, healerPos);
        if (healerPos && attackerPos && !healerPos.inRangeTo(attackerPos, 0)) {
            this.healer.travelTo(healerPos);
            this.attacker.travelTo(attackerPos);
            return true;
        }
    }

    private retreatExitPositioning(): boolean {
        if (this.state.neitherInRoom) {
            return false;
        }

        if (!this.healer.pos.isNearExit(1) && !this.attacker.pos.isNearExit(2)) {
            return false;
        }

        if (!this.healer.pos.isNearTo(this.attacker)) {
            return false;
        }

        if (this.state.fatigued) {
            return true;
        }

        let closestHostile = this.healer.pos.findClosestByRange(HostileAgent.findInRoom(this.healer.room.name));
        this.healer.moveAwayFromAlongExit(closestHostile, 1);
        this.attacker.travelTo(this.healer);
        return true;
    }

    private hostileMeleeNearby(pos: RoomPosition, range: number): HostileAgent[] {
        let hostileMelees = _.filter(HostileAgent.findInRoom(pos.roomName), h => h.getPotential(ATTACK) > 1000);
        return pos.findInRange(hostileMelees, range);
    }

    private edgeScooting() {

    }

    /**
     * Override this function in concrete class to change default behaviour (default: no headhunting)
     * @param hostiles
     */

    protected getHeadhunterAction(hostiles: HostileAgent[]): RaidAction {
        return;
    }

    /**
     * Override this function in concrete class to change default behaviour (default: pursue target)
     */

    protected headhunting() {
        let action = this.getSpecialAction();
        let creep = Game.getObjectById<Creep>(action.id);
        if (!creep || creep.pos.lookForStructure(STRUCTURE_RAMPART)) {
            this.setSpecialAction(undefined);
            return;
        }

        let hostileAgent = new HostileAgent(creep);
        this.squadTravel(this.attacker, this.healer, hostileAgent);
    }

    private findState(): RaidMissionState {
        return {
            bothInRoom: this.attacker.room === this.raidData.attackRoom
            && this.healer.room === this.raidData.attackRoom,
            neitherInRoom: this.attacker.room !== this.raidData.attackRoom
            && this.healer.room !== this.raidData.attackRoom,
            atLeastOneInRoom: this.attacker.room === this.raidData.attackRoom
            || this.healer.room === this.raidData.attackRoom,
            fatigued: this.healer.fatigue > 0 || this.attacker.fatigue > 0,
            together: this.healer.pos.isNearTo(this.attacker),
            inSameRoom: this.healer.room === this.attacker.room,
            oneInRoom: _.filter([this.healer, this.attacker], x => x.room === this.raidData.attackRoom).length === 1,
            bothNearExit: this.healer.rangeToEdge === 1 && this.attacker.rangeToEdge === 1,
            bothOnExit: this.healer.pos.isNearExit(0) && this.attacker.pos.isNearExit(0),
            neitherOnExit: !this.healer.pos.isNearExit(0) && !this.attacker.pos.isNearExit(0),
            agentInDanger: this.isInDanger(this.healer) || this.isInDanger(this.attacker),
        };
    }

    private updateMatrixForSquad(nextPos: RoomPosition, leaderPos: RoomPosition, followerPos: RoomPosition) {
        if (!nextPos || nextPos.inRangeTo(leaderPos, 0)) { return; }
        this.updateMatrix(nextPos, RAID_CREEP_MATRIX_COST);
        this.updateMatrix(followerPos, -RAID_CREEP_MATRIX_COST);
    }

    private updateMatrix(position: RoomPosition, cost: number, add = true) {
        if (!position || position.roomName !== this.raidData.attackFlag.pos.roomName) { return; }
        if (!this.raidData.raidMatrix) { return; }
        let currentCost = 0;
        if (currentCost === 0) {
            currentCost += position.terrainCost();
        }
        if (add) {
            currentCost += this.raidData.raidMatrix.get(position.x, position.y);
        }
        let newCost = Math.min(currentCost + cost, 0xff);
        if (newCost <= 0) {
            newCost = position.terrainCost();
        }
        this.raidData.raidMatrix.set(position.x, position.y, newCost);
    }
}
