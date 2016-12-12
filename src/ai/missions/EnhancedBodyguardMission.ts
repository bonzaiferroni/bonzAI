
import {Operation} from "../operations/Operation";
import {Mission} from "../missions/Mission";
import {helper} from "../../helpers/helper";
export class EnhancedBodyguardMission extends Mission {

    squadAttackers: Creep[];
    squadHealers: Creep[];

    hostiles: Creep[];
    hurtCreeps: Creep[];

    constructor(operation: Operation, allowSpawn = true) {
        super(operation, "defense", allowSpawn);
    }

    initMission() {
        if (!this.hasVision) return; // early
        this.hostiles = _.filter(this.room.hostiles, (hostile: Creep) => hostile.owner.username !== "Source Keeper");
        this.trackEnergyTillInvader();

        if (!this.spawnGroup.room.terminal) return;
        if (this.memory.allowUnboosted === undefined) {
            let store = this.spawnGroup.room.terminal.store;
            this.memory.allowUnboosted = store[RESOURCE_CATALYZED_UTRIUM_ACID] >= 1000
                && store[RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE] >= 1000;
        }

        for (let id in this.memory.ticksToLive) {
            let creep = Game.getObjectById(id);
            if (creep) continue;
            let ticksToLive = this.memory.ticksToLive[id];
            if (ticksToLive > 10 && this.memory.allowUnboosted) {
                console.log("DEFENSE:", this.opName, "lost a leeroy, increasing potency");
                this.memory.potencyUp = true;
            }
            else if (this.memory.potencyUp) {
                console.log("DEFENSE:", this.opName, "leeroy died of old age, decreasing potency:");
                this.memory.potencyUp = false;
            }
            delete this.memory.ticksToLive[id];
        }
    }

    roleCall() {
        let maxSquads = 0;
        if (this.memory.invaderProbable) {
            maxSquads = 1;
        }
        if (this.hasVision && this.hostiles.length > 0) {
            maxSquads = 1;
        }

        let attackerMemory;
        if (this.memory.potencyUp) {
            attackerMemory = {boosts: [RESOURCE_CATALYZED_UTRIUM_ACID], allowUnboosted: true};
        }

        let healerMemory;
        if (this.memory.potencyUp) {
            healerMemory = {boosts: [RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE], allowUnboosted: true};
        }

        let squadAttackerBody = () => {
            if (this.memory.potencyUp) {
                return this.configBody({
                    [ATTACK]: 10,
                    [RANGED_ATTACK]: 2,
                    [MOVE]: 12
                });
            }
            else {
                return this.configBody({
                    [ATTACK]: 20,
                    [RANGED_ATTACK]: 5,
                    [MOVE]: 25
                });
            }
        };

        let squadHealerBody = () => {
            if (this.memory.potencyUp) {
                return this.configBody({
                    [TOUGH]: 8,
                    [MOVE]: 12,
                    [HEAL]: 4,
                });
            }
            else {
                return this.configBody({
                    [TOUGH]: 4,
                    [MOVE]: 16,
                    [HEAL]: 12,
                });
            }
        };

        this.squadAttackers = this.headCount("lee", squadAttackerBody, maxSquads, {prespawn: 50, memory: attackerMemory});
        this.squadHealers = this.headCount("roy", squadHealerBody, maxSquads, {prespawn: 50, memory: healerMemory});
    }

    missionActions() {

        this.findPartnerships(this.squadAttackers, "attacker");
        this.findPartnerships(this.squadHealers, "healer");

        for (let attacker of this.squadAttackers) {
            this.squadActions(attacker);
        }

        for (let healer of this.squadHealers) {
            this.healerActions(healer);
        }
    }

    finalizeMission() {
        if (!this.memory.ticksToLive) this.memory.ticksToLive = {};
        for (let creep of this.squadAttackers) {
            this.memory.ticksToLive[creep.id] = creep.ticksToLive;
        }
        for (let creep of this.squadHealers) {
            this.memory.ticksToLive[creep.id] = creep.ticksToLive;
        }

        if (this.hostiles && this.hostiles.length > 0 && !this.memory.hostilesPresent) {
            this.memory.hostilesPresent = Game.time;
        }
        if (this.hostiles && this.hostiles.length === 0 && this.memory.hostilesPresent) {
            if (!Memory.temp.invaderDuration) {
                Memory.temp.invaderDuration = [];
            }
            let duration = Game.time - this.memory.hostilesPresent;
            Memory.temp.invaderDuration.push(duration);
            if (duration > 100) {
                console.log("ATTN: invader in", this.room.name, "duration:", duration, "time:", Game.time);
            }
            this.memory.hostilesPresent = undefined;
        }
    }

    invalidateMissionCache() {
        this.memory.allowUnboosted = undefined;
    }

    private squadActions(attacker: Creep) {

        // find healer, flee if there isn't one
        let healer = Game.creeps[attacker.memory.partner];
        if (!healer) {
            attacker.memory.partner = undefined;
            if (this.room && attacker.room.name === this.room.name) {
                let fleeing = attacker.fleeHostiles();
                if (fleeing) return;
            }
            this.moveToFlag(attacker);
            return;
        }

        if (healer.spawning) {
            if (attacker.room.name === healer.room.name) {
                attacker.idleOffRoad(this.spawnGroup.spawns[0]);
            }
            else {
                attacker.blindMoveTo(this.spawnGroup.spawns[0]);
            }
            return;
        }

        // room is safe
        if (!this.hostiles || this.hostiles.length === 0) {
            healer.memory.mindControl = false;
            this.moveToFlag(attacker);
            return;
        }

        let attacking = false;
        let rangeAttacking = false;
        healer.memory.mindControl = true;
        let target = attacker.pos.findClosestByRange(_.filter(this.hostiles, (c: Creep) => c.partCount(HEAL) > 0)) as Creep;
        if (!target) {
            target = attacker.pos.findClosestByRange(this.hostiles) as Creep;
        }
        if (!target && attacker.memory.targetId) {
            target = Game.getObjectById(attacker.memory.targetId) as Creep;
            if (!target) attacker.memory.targetId = undefined;
        }
        if (healer.hits < healer.hitsMax * .5 || attacker.hits < attacker.hitsMax * .5) {
            this.memory.healUp = true;
        }
        if (this.memory.healUp === true) {
            this.squadTravel(healer, attacker, this.spawnGroup.spawns[0]);
            if (healer.hits > healer.hitsMax * .8 && attacker.hits > attacker.hitsMax * .8) {
                this.memory.healUp = false;
            }
        }
        else if (target) {
            attacker.memory.targetId = target.id;

            let range = attacker.pos.getRangeTo(target);
            if (range === 1) {
                attacker.rangedMassAttack();
                attacking = attacker.attack(target) === OK;
            }
            else if (range <= 3) {
                rangeAttacking = attacker.rangedAttack(target) === OK;
            }

            if (attacker.room.name !== target.room.name) {
                this.squadTravel(attacker, healer, target);
            }
            else if (range > 3 || (range > 1 && !(Game.time - attacker.memory.fleeTick === 1))) {
                this.squadTravel(attacker, healer, target, {maxRooms: 1});
            }
            else if (range > 1) {
                let fleePath = PathFinder.search(target.pos, {pos: attacker.pos, range: 5 }, {flee: true, maxRooms: 1});
                // will only flee-bust  on consecutive ticks
                if (fleePath.incomplete || !fleePath.path[1] || !fleePath.path[1].isNearExit(0)) {
                    this.squadTravel(attacker, healer, target, {maxRooms: 1, ignoreRoads: true});
                }
                else {
                    attacker.memory.fleeTick = Game.time;
                    this.squadTravel(attacker, healer, {pos: fleePath.path[1]}, {maxRooms: 1, ignoreRoads: true});
                }
            }
            else {
                if (!target.isNearExit(0)) {
                    // directly adjacent, move on to same position
                    this.squadTravel(attacker, healer, target);
                }
                else {
                    let direction = attacker.pos.getDirectionTo(target);
                    if (direction % 2 === 1) return; // not a diagonal position, already in best position;
                    let clockwisePosition = attacker.pos.getPositionAtDirection(helper.clampDirection(direction + 1));
                    if (!clockwisePosition.isNearExit(0)) {
                        this.squadTravel(attacker, healer, {pos: clockwisePosition});
                    }
                    else {
                        let counterClockwisePosition = attacker.pos.getPositionAtDirection(helper.clampDirection(direction - 1));
                        this.squadTravel(attacker, healer, {pos: counterClockwisePosition});
                    }
                }
            }
        }
        else {
            this.squadTravel(attacker, healer, this.flag);
        }

        let closest = attacker.pos.findClosestByRange(this.hostiles);
        if (closest) {
            let range = attacker.pos.getRangeTo(closest);
            if (!attacking && range === 1) {
                attacker.attack(closest);
                if (!rangeAttacking) {
                    rangeAttacking = true;
                    attacker.rangedMassAttack();
                }
            }
            if (!rangeAttacking && range <= 3) {
                attacker.rangedAttack(closest);
            }
        }
    }

    private healerActions(healer: Creep) {
        if (!this.hostiles || this.hostiles.length === 0) {
            if (healer.hits < healer.hitsMax) {
                healer.heal(healer);
            }
            else {
                this.healHurtCreeps(healer);
            }
            return;
        }

        // hostiles in room
        let attacker = Game.creeps[healer.memory.partner];
        if (!attacker) {
            healer.memory.partner = undefined;
        }

        if (!attacker || attacker.spawning) {
            if (healer.hits < healer.hitsMax) {
                healer.heal(healer);
            }
            if (attacker && attacker.room.name === healer.room.name) {
                healer.idleOffRoad(this.spawnGroup.spawns[0]);
            }
            else {
                healer.blindMoveTo(this.spawnGroup.spawns[0]);
            }
            return;
        }

        // attacker is partnered and spawned
        let range = healer.pos.getRangeTo(attacker);
        if (range <= 3) {
            if (attacker.hitsMax - attacker.hits > healer.hitsMax - healer.hits) {
                if (range > 1) {
                    healer.rangedHeal(attacker);
                }
                else {
                    healer.heal(attacker);
                }
            }
            else {
                healer.heal(healer);
            }
        }
        else if (healer.hits < healer.hitsMax) {
            healer.heal(healer);
        }
    }

    private findHurtCreep(defender: Creep) {
        if (!this.room) return;

        if (defender.memory.healId) {
            let creep = Game.getObjectById(defender.memory.healId) as Creep;
            if (creep && creep.room.name === defender.room.name && creep.hits < creep.hitsMax) {
                return creep;
            }
            else {
                defender.memory.healId = undefined;
                return this.findHurtCreep(defender);
            }
        }
        else if (!defender.memory.healCheck || Game.time - defender.memory.healCheck > 25) {
            defender.memory.healCheck = Game.time;
            if (!this.hurtCreeps || this.hurtCreeps.length === 0) {
                this.hurtCreeps = this.room.find(FIND_MY_CREEPS, {filter: (c: Creep) => {
                    return c.hits < c.hitsMax && c.ticksToLive > 100 && c.partCount(WORK) > 0;
                }}) as Creep[];
            }
            if (this.hurtCreeps.length === 0) {
                this.hurtCreeps = this.room.find(FIND_MY_CREEPS, {filter: (c: Creep) => {
                    return c.hits < c.hitsMax && c.ticksToLive > 100 && c.partCount(CARRY) > 0 && c.carry.energy < c.carryCapacity;
                }}) as Creep[];
            }

            if (this.hurtCreeps.length > 0) {
                let closest = defender.pos.findClosestByRange(this.hurtCreeps);
                if (closest) {
                    this.hurtCreeps = _.pull(this.hurtCreeps, closest);
                    defender.memory.healId = closest.id;
                    return closest;
                }
            }
        }
    }

    private healHurtCreeps(defender: Creep) {
        let hurtCreep = this.findHurtCreep(defender);
        if (!hurtCreep) {
            this.moveToFlag(defender);
            return;
        }

        // move to creep
        let range = defender.pos.getRangeTo(hurtCreep);
        if (range > 1) {
            defender.blindMoveTo(hurtCreep, {maxRooms: 1});
        }
        else {
            defender.yieldRoad(hurtCreep);
        }

        if (range === 1) {
            defender.heal(hurtCreep);
        }
        else if (range <= 3) {
            defender.rangedHeal(hurtCreep);
        }
    }

    private squadTravel(attacker: Creep, healer: Creep, target: {pos: RoomPosition}, ops?: any) {

        let healerOps: PathFinderOpts = {};
        if (attacker.room.name === healer.room.name) {
            healerOps.maxRooms = 1;
        }

        let range = attacker.pos.getRangeTo(healer);
        if (attacker.pos.isNearExit(1)) {
            attacker.blindMoveTo(target, ops);
            healer.blindMoveTo(attacker);
        }
        else if (attacker.room.name !== healer.room.name) {
            if (healer.isNearExit(1)) {
                attacker.blindMoveTo(target, ops);
            }
            healer.blindMoveTo(attacker);
        }
        else if (range > 2) {
            attacker.blindMoveTo(healer, ops);
            healer.blindMoveTo(attacker, ops, true);
        }
        else if (range === 2) {
            healer.blindMoveTo(attacker, ops, true);
        }
        else if ((attacker.fatigue === 0 && healer.fatigue === 0)) {
            if (attacker.pos.isNearTo(target)) {
                attacker.move(attacker.pos.getDirectionTo(target));
            }
            else {
                attacker.blindMoveTo(target);
            }
            healer.move(healer.pos.getDirectionTo(attacker));
        }
    }

    public trackEnergyTillInvader() {
        if (!this.memory.invaderTrack) {
            this.memory.invaderTrack = {energyHarvested: 0, tickLastSeen: Game.time, energyPossible: 0, log: []};
        }

        let memory = this.memory.invaderTrack;

        // filter source keepers
        let hostiles = this.hostiles;

        let harvested = 0;
        let possible = 0;
        let sources = this.room.find(FIND_SOURCES) as Source[];
        for (let source of sources) {
            if (source.ticksToRegeneration === 1) {
                harvested += source.energyCapacity - source.energy;
                possible += source.energyCapacity;
            }
        }

        memory.energyHarvested += harvested;
        memory.energyPossible += possible;

        if (sources.length === 3) {
            this.memory.invaderProbable = memory.energyHarvested > 65000;
        }
        else if (sources.length === 2 && Game.time - memory.tickLastSeen < 20000) {
            this.memory.invaderProbable = memory.energyHarvested > 75000;
        }
        else if (sources.length === 1 && Game.time - memory.tickLastSeen < 20000) {
            this.memory.invaderProbable = memory.energyHarvested > 90000;
        }
        else {
            this.memory.invaderProbable = false;
        }

        if (hostiles.length > 0 && Game.time - memory.tickLastSeen > 1500) {
            // reset trackers
            memory.energyPossible = 0;
            memory.energyHarvested = 0;
            memory.tickLastSeen = Game.time;
        }
    }
}