import {Mission} from "./Mission";
import {RaidData, BoostLevel, RaidAction, RaidActionType} from "../../interfaces";
import {Operation} from "../operations/Operation";
import {SpawnGroup} from "../SpawnGroup";
import {Agent} from "./Agent";
import {ROOMTYPE_CORE, WorldMap} from "../WorldMap";
import {empire} from "../Empire";
import {notifier} from "../../notifier";
import {helper} from "../../helpers/helper";
import {RaidOperation} from "../operations/RaidOperation";
import {HostileAgent} from "./HostileAgent";
export abstract class RaidMission extends Mission {

    protected attacker: Agent;
    protected healer: Agent;

    protected raidData: RaidData;
    protected raidOperation: RaidOperation;

    protected specialistPart: string;
    protected specialistBoost: string;
    protected spawnCost: number;

    protected raidWaypoints: Flag[];

    public spawned: boolean;
    protected boostLevel: number;

    protected healerBoosts: string[];
    protected attackerBoosts: string[];

    protected killCreeps: boolean;

    protected attackRange: number;
    protected attacksCreeps: boolean;

    public memory: {
        healerLead: boolean;
        spawned: boolean;
        hc: {[roleName: string]: string}
        chessMode: boolean;
        killCreeps: boolean;
        targetId: string;
    };

    protected abstract clearActions(attackingCreep: boolean);

    constructor(operation: RaidOperation, name: string, raidData: RaidData, spawnGroup: SpawnGroup, boostLevel: number,
                allowSpawn: boolean) {
        super(operation, name, allowSpawn);
        this.raidOperation = operation;
        this.raidData = raidData;
        this.spawnGroup = spawnGroup;
        this.boostLevel = boostLevel;
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
        this.healCreeps();
        let attackingCreep = this.attackCreeps();
        let attackingStructure = this.attackStructure(attackingCreep);

        // creeps report about situation
        this.raidTalk();

        let manualPositioning = this.manualPositioning(attackingCreep);
        if (manualPositioning) { return; }

        if (this.killCreeps || this.memory.targetId) {
            let foundHostiles = this.focusCreeps();
            if (foundHostiles) { return; }
        }

        /* ------TRAVEL PHASE------ */
        let waypointsTraveled = this.waypointSquadTravel(this.healer, this.attacker, this.raidWaypoints);
        if (!waypointsTraveled) { return; }

        /* --------FALLBACK-------- */
        if (this.raidData.fallback) {
            Agent.squadTravel(this.healer, this.attacker, this.raidData.fallbackFlag);
            return;
        }

        /* --------SPECIAL-------- */
        try {
            let maneuvering = this.specialActions();
            if (maneuvering) { return; }
        } catch (e) {
            console.log(e.stack);
            this.raidOperation.memory.fallback = true;
            Agent.squadTravel(this.healer, this.attacker, this.raidData.fallbackFlag);
        }

        /* -------ENTRY PHASE------ */
        let entrancing = this.entryActions();
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

    private findAttackerEntrance() {
        let positions = _.filter(this.healer.pos.openAdjacentSpots(), p => p.isNearExit(1));
        if (positions.length === 0) {
            console.log("no roomfor attacker");
            return;
        }
        let nearest = this.attacker.pos.findClosestByRange(positions);
        if (nearest && this.attacker.pos.isNearTo(nearest)) {
            return nearest;
        }

        this.healer.travelTo(positions[0]);
        return this.healer.pos;
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
        this.healer.memory.action = action;
    }

    private entryActions(): boolean {
        let destination = this.raidData.targetFlags[0];
        if (!destination) {
            destination = this.raidData.attackFlag;
        }
        if (this.healer.room !== this.raidData.attackRoom) {
            Agent.squadTravel(this.healer, this.attacker, destination, {ignoreCreeps: false});
            return true;
        }
        if (this.healer.pos.isNearExit(0)) {
            if (this.healer.moveOffExit() === ERR_NO_PATH) {
                let directions = [1, 3, 5, 7];
                let positions: RoomPosition[] = [];
                for (let direction of directions) {
                    let position = this.healer.pos.getPositionAtDirection(direction);
                    if (position.x === 0 || position.x === 49 || position.y === 0 || position.y === 49) {
                        if (position.lookFor(LOOK_TERRAIN)[0] === "wall") { continue; }
                        positions.push(position);
                    }
                }
                let best = destination.pos.findClosestByRange(positions);
                if (best) {
                    this.healer.move(this.healer.pos.getDirectionTo(best));
                    console.log("edge scoot!");
                }
            }
            return true;
        }
        if (this.attacker.room !== this.raidData.attackRoom) {
            this.attacker.travelTo(this.healer);
            return true;
        }
        if (this.attacker.pos.isNearExit(0)) {
            // Agent.squadTravel(this.attacker, this.healer, this.raidData.breachFlags[0]);
            console.log(`attacker getting into place`);
            let position = this.findAttackerEntrance();
            if (!position) {
                console.log(`RAID: no room for attacker`);
                return;
            }
            this.attacker.travelTo(position, {ignoreCreeps: false});
            return true;
        }
    }

    protected standardClearActions(attackingCreep) {
        let target;
        if (this.raidData.targetStructures.length > 0) {
            target = this.findMissionTarget(this.raidData.targetStructures);
        } else {
            target = this.findMissionTarget(this.room.hostiles);
        }

        if (!target) {
            console.log(`couldn't find target! ${this.raidData.attackRoom}`);
            return;
        }

        if (this.attacker.pos.inRangeTo(target, this.attackRange)) {
            if (target.pos.lookFor(LOOK_TERRAIN)[0] !== "swamp") {
                Agent.squadTravel(this.attacker, this.healer, target);
            }
        } else {
            Agent.squadTravel(this.attacker, this.healer, target, {range: this.attackRange});
        }
    }

    protected finishActions(attackingCreep: boolean) {
        // TODO: add more interesting rating based on raid stats
        let signText = this.operation.memory.signText ||
            "this room has been expected by bonzAI and given the following rating: ouch++";
        let sign = this.raidData.attackRoom.controller.sign;
        if (!sign || sign.text !== signText) {
            Agent.squadTravel(this.attacker, this.healer, this.raidData.attackRoom.controller);
            this.attacker.creep.signController(this.attacker.room.controller, signText);
            return;
        }
        Agent.squadTravel(this.healer, this.attacker, this.raidData.attackFlag);
    }

    private waypointSquadTravel(healer: Agent, attacker: Agent, waypoints: Flag[]): boolean {
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

        if (waypoint.room && leader.pos.inRangeTo(waypoint, 1)) {
            console.log(`RAID: waypoint ${healer.memory.waypointIndex} reached (${this.operation.name} ${this.name})`);
            healer.memory.waypointIndex++;
        }

        Agent.squadTravel(leader, follower, waypoint);
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

    protected squadFlee(roomObject: RoomObject) {
        if (this.attacker.fatigue > 0) { return ERR_BUSY; }

        if (this.attacker.pos.isNearTo(this.healer)) {
            if (this.attacker.pos.inRangeTo(roomObject, 2)) {
                this.healer.retreat([roomObject]);
                this.attacker.move(this.attacker.pos.getDirectionTo(this.healer));
            }
        } else {
            this.attacker.travelTo(this.healer, {ignoreCreeps: false});
        }
    }

    protected healerBody = (): string[] => {
        if (this.boostLevel === BoostLevel.Training) {
            return this.configBody({ [TOUGH]: 1, [MOVE]: 2, [HEAL]: 1 });
        } else if (this.boostLevel === BoostLevel.Unboosted) {
            return this.configBody({ [TOUGH]: 5, [MOVE]: 25, [HEAL]: 20 });
        } else if (this.boostLevel === BoostLevel.SuperTough) {
            return this.configBody({ [TOUGH]: 12, [MOVE]: 10, [HEAL]: 28 });
        } else if (this.boostLevel === BoostLevel.RCL7) {
            return this.configBody({ [TOUGH]: 12, [MOVE]: 8, [HEAL]: 20 });
        } else {
            return this.configBody({ [TOUGH]: 12, [MOVE]: 10, [HEAL]: 28 });
        }
    };

    protected attackerBody = (): string[] => {
        if (this.boostLevel === BoostLevel.Training) {
            return this.configBody({ [TOUGH]: 1, [MOVE]: 3, [this.specialistPart]: 1, [RANGED_ATTACK]: 1 });
        } else if (this.boostLevel === BoostLevel.Unboosted) {
            return this.configBody({ [TOUGH]: 5, [MOVE]: 25, [this.specialistPart]: 19, [RANGED_ATTACK]: 1 });
        } else if (this.boostLevel === BoostLevel.SuperTough) {
            return this.configBody({ [TOUGH]: 24, [MOVE]: 10, [this.specialistPart]: 15, [RANGED_ATTACK]: 1 });
        } else if (this.boostLevel === BoostLevel.RCL7) {
            return this.configBody({ [TOUGH]: 12, [MOVE]: 8, [this.specialistPart]: 19, [RANGED_ATTACK]: 1 });
        } else {
            return this.configBody({ [TOUGH]: 12, [MOVE]: 10, [this.specialistPart]: 27, [RANGED_ATTACK]: 1 });
        }
    };

    private healCreeps() {
        if (!this.healer) { return; }

        if (!this.raidData.injuredCreeps) {
            this.raidData.injuredCreeps = {};
            for (let creep of this.raidData.raidAgents) {
                if (creep.hits === creep.hitsMax) { continue; }
                this.raidData.injuredCreeps[creep.name] = creep.hits;
            }
        }

        let injuredCreeps = _.map(Object.keys(this.raidData.injuredCreeps),
            (name: string) => Game.creeps[name]) as Creep[];
        for (let creep of injuredCreeps) {
            if (!(creep instanceof Creep)) {
                console.log(`found a bad creep in injured creeps: ${creep}`);
            }
        }

        let healedAmount = (healer: Agent, shortRange: boolean) => {
            let healPerPart = 4;
            if (this.boostLevel !== BoostLevel.Unboosted) {
                healPerPart *= 4;
            }
            if (shortRange) {
                healPerPart *= 3;
            }
            return healer.partCount(HEAL) * healPerPart;
        };

        let closeRange = _(this.healer.pos.findInRange(injuredCreeps, 1))
            .sortBy("hits")
            .head();
        if (closeRange) {
            if (!this.healer) { console.log("no healer?"); }
            let outcome = this.healer.heal(closeRange);
            if (outcome !== OK) { console.log(`healing error: ${outcome}`); }
            this.raidData.injuredCreeps[closeRange.name] += healedAmount(this.healer, true);
            if (this.raidData.injuredCreeps[closeRange.name] > closeRange.hitsMax) {
                delete this.raidData.injuredCreeps[closeRange.name];
            }
            return;
        }

        let longRange = _(this.healer.pos.findInRange(injuredCreeps, 3))
            .sortBy("hits")
            .head();
        if (longRange) {
            if (!this.healer) { console.log("no healer?"); }
            let outcome = this.healer.rangedHeal(longRange);
            if (outcome !== OK) { console.log(`healing error: ${outcome}`); }
            this.raidData.injuredCreeps[longRange.name] += healedAmount(this.healer, true);
            if (this.raidData.injuredCreeps[longRange.name] > longRange.hitsMax) {
                delete this.raidData.injuredCreeps[longRange.name];
            }
            return;
        }

        if (this.healer.room === this.raidData.attackRoom) {
            this.healer.heal(this.attacker);
        }
    }

    private attackCreeps(): boolean {
        let creepTargets = _(this.attacker.pos.findInRange(this.attacker.room.hostiles, 3))
            .filter((c: Creep) => _.filter(c.pos.lookFor(LOOK_STRUCTURES),
                (s: Structure) => s.structureType === STRUCTURE_RAMPART).length === 0)
            .sortBy("hits")
            .value();

        if (creepTargets.length === 0) {
            return false;
        }

        let closest = this.attacker.pos.findClosestByRange(creepTargets);
        let range = this.attacker.pos.getRangeTo(closest);

        if (range === 1 || creepTargets.length > 1) {
            this.attacker.rangedMassAttack();
        } else {
            this.attacker.rangedAttack(closest);
        }

        if (range === 1 && this.attacker.partCount(ATTACK)) {
            let hostileAgent = new HostileAgent(closest);
            if (hostileAgent.potentials[ATTACK] * 2 < this.attacker.shield
                || this.attacker.hits === this.attacker.hitsMax) {
                this.attacker.attack(closest);
            }
            return true;
        }

        if (this.attacker.partCount(RANGED_ATTACK) > 1) {
            return true;
        }
    }

    private attackStructure(attackingCreep: boolean) {

        let target = this.attacker.pos.findClosestByRange(this.raidData.targetStructures);

        this.attacker.dismantle(target);
        if (!attackingCreep) {
            this.attacker.attack(target);
            if (this.attacker.room === this.raidData.attackRoom) {
                this.attacker.rangedMassAttack();
            }
        }
    }

    private preparePhase() {
        if (this.attacker && !this.healer) {
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
            let nearAttackRoom = Game.map.getRoomLinearDistance(this.raidData.attackFlag.pos.roomName,
                this.healer.room.name) === 1;
            if (nearAttackRoom && this.healer.pos.isNearExit(2) && this.healer.ticksToLive < 1000
                && this.raidData.targetFlags.length > 0) {
                this.healer.travelTo(this.raidData.targetFlags[0]);
            } else {
                this.healer.idleOffRoad(this.flag);
            }
            this.healCreeps();
        }

        return this.attacker && this.healer;
    }

    private raidTalk() {
        if (this.attacker.hits < this.attacker.hitsMax) {
            this.attacker.say("" + this.attacker.hits);
        }

        if (this.healer.hits < this.healer.hitsMax) {
            this.healer.say("" + this.healer.hits);
        }
    }

    protected focusCreeps() {

        if (!this.attacksCreeps) {
            return false;
        }

        let closest = this.attacker.pos.findClosestByRange(_.filter(this.attacker.room.hostiles, (c: Creep) => {
            return c.owner.username !== "Source Keeper" && c.body.length > 10;
        }));
        if (closest) {
            let range = this.attacker.pos.getRangeTo(closest);
            if (range > 1) {
                Agent.squadTravel(this.attacker, this.healer, closest);
            } else if (range === 1 && this.healer.fatigue === 0) {
                this.attacker.move(this.attacker.pos.getDirectionTo(closest));
                if (this.healer.pos.getRangeTo(this.attacker) === 1) {
                    this.healer.move(this.healer.pos.getDirectionTo(this.attacker));
                } else {
                    this.healer.travelTo(this.attacker);
                }
            }
            return true;
        } else {
            return false;
        }
    }

    private findMissionTarget(possibleTargets: {pos: RoomPosition, id: string}[]) {
        if (this.attacker.memory.attackTargetId) {
            let target = Game.getObjectById<{pos: RoomPosition, id: string}>(this.attacker.memory.attackTargetId);
            if (target && this.hasValidPath(this.attacker, target)) {
                return target;
            } else {
                delete this.attacker.memory.attackTargetId;
                return this.findMissionTarget(possibleTargets);
            }
        } else {
            let closest = this.attacker.pos.findClosestByRange<{pos: RoomPosition, id: string}>(possibleTargets);
            if (!closest) {
                return;
            }
            if (this.hasValidPath(this.attacker, closest)) {
                this.attacker.memory.attackTargetId = closest.id;
                return closest;
            }
            let sortedTargets = _.sortBy(possibleTargets,
                (s: Structure) => this.attacker.pos.getRangeTo(s));
            for (let target of sortedTargets) {
                if (this.hasValidPath(this.attacker, target)) {
                    this.attacker.memory.structureTargetId = target.id;
                    return target;
                } else {
                    target.pos.createFlag(`exclude_${target.id}`);
                }
                if (Game.cpu.getUsed() > 450) { return; }
            }
        }
    }

    private hasValidPath(origin: {pos: RoomPosition}, destination: {pos: RoomPosition}): boolean {
        let obstacles = _.filter(this.raidData.obstacles, (c: Agent) => c !== this.attacker);
        let ret = empire.traveler.findTravelPath(origin, destination, {obstacles: obstacles, maxOps: 2000 });
        return !ret.incomplete;
    }

    private findSpawnedStatus() {
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

    private manualPositioning(attackingCreep: boolean) {
        let index = this.operation.memory.posIndex;
        if (index === undefined) { return false; }
        let attackPosFlag = Game.flags[`${this.operation.name}_${this.name}_attacker_${index}`];
        let healerPosFlag = Game.flags[`${this.operation.name}_${this.name}_healer_${index}`];
        if (!attackPosFlag && !healerPosFlag) { return false; }

        if (!attackingCreep) {
            let structure = _.find(this.raidData.targetStructures,
                s => s.pos.inRangeTo(this.attacker, this.attackRange));
            if (!structure && attackPosFlag && attackPosFlag.room) {
                structure = attackPosFlag.pos.lookFor<Structure>(LOOK_STRUCTURES)[0];
            }
            if (structure && this.attacker.pos.getRangeTo(structure) <= this.attackRange) {
                this.attacker.dismantle(structure);
                this.attacker.attack(structure);
                this.attacker.rangedMassAttack();
            }
        }

        if (healerPosFlag && !attackPosFlag) {
            Agent.squadTravel(this.healer, this.attacker, healerPosFlag);
            return true;
        }

        if (attackPosFlag && !healerPosFlag) {
            Agent.squadTravel(this.attacker, this.healer, attackPosFlag);
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

    private specialActions() {
        this.detectDanger();
        if (!this.getSpecialAction()) { return false; }
        this.processAction(this.getSpecialAction());
        return true;
    }

    private processAction(action: RaidAction) {
        switch (action.type) {
            case RaidActionType.Wallflower:
                this.wallflowering();
                break;
            case RaidActionType.LurkOutside:
                this.lurking();
                break;
            case RaidActionType.Retreat:
                this.retreating();
                break;
            case RaidActionType.EdgeScoot:
                this.edgeScooting();
                break;
            case RaidActionType.Headhunter:
                this.headhunting();
                break;
            default:
                break;
        }
    }

    private detectDanger() {
        let currentAction = this.getSpecialAction();
        if (currentAction && currentAction.type === RaidActionType.Retreat) { return; }

        if (this.attacker.shield === 0 || this.healer.shield === 0) {
            console.log(`start retreat!`);
            this.setSpecialAction({
                type: RaidActionType.Retreat,
            });
            return;
        }

        // only considering agents within the room
        let agentsInRoom: Agent[] = _.filter([this.attacker, this.healer], c => c.room === this.raidData.attackRoom);
        let areTogether = this.attacker.pos.isNearTo(this.attacker);
        let noFatigue = this.attacker.fatigue === 0 && this.healer.fatigue === 0;
        let bothOnExit = _.filter(agentsInRoom, a => a.rangeToEdge === 0).length === 2;
        let bothNearExit = _.filter(agentsInRoom, a => a.rangeToEdge === 1).length === 2;
        for (let agent of agentsInRoom) {
            if (!this.isInDanger(agent)) { continue; }

            /*
            if (this.hostileMeleeNearby(agent) && areTogether && bothOnExit && noFatigue) {
                console.log(`start edge scoot!`);
                this.setSpecialAction({
                    type: RaidActionType.EdgeScoot,
                });
                return;
            }
            */

            if (areTogether && bothOnExit && noFatigue) {
                console.log(`start lurking!`);
                this.setSpecialAction({
                    type: RaidActionType.LurkOutside,
                    endAtTick: Game.time + 5,
                });
                return;
            }

            if (areTogether && bothNearExit && noFatigue) {
                console.log(`start wallflowering!`);
                this.setSpecialAction({
                    type: RaidActionType.Wallflower,
                });
                return;
            }

            console.log(`start retreat!`);
            this.setSpecialAction({
                type: RaidActionType.Retreat,
            });
            return;

        }
        if (this.getSpecialAction() && agentsInRoom.length === 2) {
            console.log("RAID: danger seems to be gone, returning to default actions");
            this.setSpecialAction(undefined);
        }

        if (!this.getSpecialAction() && agentsInRoom.length === 0 && areTogether) {
            let hostileAgents = _.filter(this.raidData.getHostileAgents(this.attacker.room.name),
                h => !h.pos.isNearExit(1));
            if (hostileAgents.length > 0) {
                let action = this.getHeadhunterAction(hostileAgents);
                if (action) {
                    this.setSpecialAction(action);
                }
            }
        }
    }

    private getExpectedDamage(agent: Agent): number {
        let hostileAgents = this.raidData.getHostileAgents(this.healer.room.name);
        let hostileDamage = 0;
        for (let hostileAgent of hostileAgents) {
            // it is possible that both creeps can move toward each other
            let rangeNextTick = agent.pos.getRangeTo(hostileAgent) - 2;
            hostileDamage += hostileAgent.expectedDamageAtRange(rangeNextTick);
        }
        let towerDamage = helper.towerDamageAtPosition(agent.pos,
            agent.room.findStructures<StructureTower>(STRUCTURE_TOWER));

        return hostileDamage + towerDamage;
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
        if (this.healer.pos.inRangeTo(this.raidData.fallbackFlag, 0) && this.healer.hits === this.healer.hitsMax) {

            let hostileAgents = _.filter(this.raidData.getHostileAgents(this.attacker.room.name),
                h => !h.pos.isNearExit(1));
            if (hostileAgents.length > 0) {
                let action = this.getHeadhunterAction(hostileAgents);
                if (action) {
                    this.setSpecialAction(action);
                    this.processAction(action);
                    return;
                }
            }

            let rangeToClosest = 0;
            if (this.raidData.targetFlags.length > 0 && this.raidData.attackRoom) {
                let destination = this.raidData.targetFlags[0].pos;
                let hostiles = this.hostileMeleeNearby(destination, 25);
                rangeToClosest = destination.getRangeToClosest(hostiles) || 100;
                if (rangeToClosest > 10) {
                    console.log(`RAID: retreat completed (safe near destination)`);
                    this.setSpecialAction(undefined);
                }
            }

            if (rangeToClosest > 2 && Game.time > this.healer.memory.endRetreat) {
                this.healer.memory.endRetreat = undefined;
                console.log(`RAID: retreat completed, (timer expired)`);
                this.setSpecialAction(undefined);
            } else if (this.healer.memory.endRetreat === undefined) {
                this.healer.memory.endRetreat = Game.time + 10;
            }

            return;
        }

        Agent.squadTravel(this.healer, this.attacker, this.raidData.fallbackFlag, {ignoreCreeps: false});
        if (this.healer.pos.isNearExit(0)) {
            if (this.healer.room !== this.raidData.attackRoom) {
                this.healer.moveOffExit(false);
            } else {
                this.healer.creep.cancelOrder("move");
            }
        }
        if (this.attacker.pos.isNearExit(0)) {
            if (this.attacker.room !== this.raidData.attackRoom) {
                this.attacker.moveOffExit(false);
            } else {
                this.attacker.creep.cancelOrder("move");
            }
        }

        if (this.attacker.room === this.raidData.attackRoom && this.attacker.pos.isNearExit(1)) {
            this.attacker.moveOnExit();
        }
    }

    private hostileMeleeNearby(pos: RoomPosition, range: number): HostileAgent[] {
        let hostileMelees = _.filter(this.raidData.getHostileAgents(pos.roomName), h => h.potentials[ATTACK] > 1000);
        return pos.findInRange(hostileMelees, range);
    }

    private edgeScooting() {

    }

    protected getHeadhunterAction(hostiles: HostileAgent[]): RaidAction {
        return;
    }

    private headhunting() {
        let target: HostileAgent;
        if (this.attacker.memory.hTargetId) {
            let creep = Game.getObjectById<Creep>(this.attacker.memory.hTargetId);
            if (creep) {
                this.attacker.memory.hPos = creep.pos;
                this.attacker.memory.hTimeout = Game.time + 10;
                target = new HostileAgent(creep);
            } else {
                if (Game.time > this.attacker.memory.hTimeout) {
                    delete this.attacker.memory.hTargetId;
                    delete this.attacker.memory.hPos;
                    delete this.attacker.memory.hTimeout;
                }
                if (this.attacker.memory.hPos) {
                    let position = helper.deserializeRoomPosition(this.attacker.memory.hPos);
                    if (position.isNearExit(1) && this.attacker.pos.getRangeTo(position) < 10) {
                        if (this.attacker.pos.getRangeTo(position) === 0) {
                            this.attacker.moveOnExit();
                            this.healer.travelTo(this.attacker);
                        } else {
                            Agent.squadTravel(this.attacker, this.healer, {pos: position});
                            return;
                        }
                    }
                }
            }
        }
        let hostileAgents = _.filter(this.raidData.getHostileAgents(this.attacker.room.name),
            h => !h.pos.isNearExit(1));
        let nearest = this.attacker.pos.findClosestByRange(hostileAgents);
        if (nearest) {
            if (!target || this.attacker.pos.getRangeTo(nearest) < this.attacker.pos.getRangeTo(target)) {
                this.attacker.memory.hTargetId = nearest.id;
                this.attacker.memory.hPos = nearest.pos;
                this.attacker.memory.hTimeout = Game.time + 10;
                target = nearest;
            }
        }

        if (target) {
            Agent.squadTravel(this.attacker, this.healer, target);
        } else {
            this.setSpecialAction(undefined);
            console.log("RAID: no hostiles, end headhunter");
        }
    }
}
