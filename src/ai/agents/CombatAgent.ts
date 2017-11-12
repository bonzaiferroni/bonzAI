import {Agent} from "./Agent";
import {MatrixHelper} from "../../helpers/MatrixHelper";
import {CreepHelper} from "../../helpers/CreepHelper";
import {core} from "../Empire";
import {HostileAgent} from "./HostileAgent";
import {PosHelper} from "../../helpers/PosHelper";
import {Notifier} from "../../notifier";
import {Traveler} from "../../Traveler";

export class CombatAgent extends Agent {

    public posLastTick: RoomPosition;
    private debug: boolean;

    public standardAttackActions(roomName: string, attackStructures = false) {
        this.attackCreeps();
        if (attackStructures) {
            this.attackStructures(roomName);
        }
        this.healCreeps();

        let recovering = this.recover();
        if (recovering) {
            return true;
        }

        let traveling = this.standardTravel(roomName);
        if (traveling) {
            return true;
        }

        let goals = this.standardGoals(attackStructures);
        let maneuvering = this.maneuver(goals.approach, goals.avoid);
        if (maneuvering !== undefined) {
            return true;
        }
    }

    public maneuver(approachGoals: Goal[], avoidGoals: Goal[]): number {

        let outcome;
        if (avoidGoals) {
            let avoidRet = PathFinder.search(this.pos, avoidGoals, {
                roomCallback: MatrixHelper.standardCallback(this.pos),
                flee: true,
            });

            if (avoidRet.path.length > 0) {
                if (this.debug) { Traveler.serializePath(this.pos, avoidRet.path, "magenta"); }
                outcome = this.moveToward(avoidRet.path[0]);
            }
        }

        if (approachGoals) {
            let approachRet = PathFinder.search(this.pos, approachGoals, {
                roomCallback: MatrixHelper.standardCallback(this.pos),
                maxRooms: 1,
            });

            if (approachRet.path.length > 0) {
                if (this.debug) { Traveler.serializePath(this.pos, approachRet.path, "cyan"); }
                outcome = this.moveToward(approachRet.path[0]);
            } else {
                outcome = OK;
            }
        }

        return outcome;
    }

    public attackCreeps() {
        if (this.room.hostiles.length === 0) { return; }
        let creepTargets = _(this.pos.findInRange(this.room.hostiles, 3))
            .filter(x => !x.pos.lookForStructure(STRUCTURE_RAMPART))
            .sortBy(x => x.hits + CreepHelper.partCount(x, ATTACK) + x.pos.getRangeTo(this) * 100)
            .value();

        if (creepTargets.length === 0) {
            return;
        }

        // ranged attack
        if (this.getPotential(RANGED_ATTACK) > 0) {
            let best = creepTargets[0];
            let range = this.pos.getRangeTo(best);

            if (range === 1 || this.massAttackDamage(creepTargets) >= 10) {
                this.rangedMassAttack();
            } else {
                this.rangedAttack(best);
            }
        }

        // melee attack
        if (this.getPotential(ATTACK) > 0) {
            creepTargets = this.pos.findInRange(creepTargets, 1);
            let best = creepTargets[0];
            if (!best) { return; }

            let attackPotential = CreepHelper.getPotential(best, ATTACK);
            if (attackPotential * 2 < this.shield.hits || this.hits >= this.hitsMax * .9) {
                this.attack(best);
            }
        }
    }

    public attackStructures(roomName: string) {
        if (this.pos.roomName !== roomName) {
            return;
        }

        let structureTargets = _(this.pos.findInRange<Structure>(FIND_STRUCTURES, 3))
            .sortBy(x => x.hits)
            .value();

        if (structureTargets.length === 0) {
            return;
        }

        // ranged attack
        if (this.getPotential(RANGED_ATTACK) > 0 && !this.isRangedAttacking && !this.isRangedMassAttacking) {
            let best = structureTargets[0];
            let range = this.pos.getRangeTo(best);

            if (best.hasOwnProperty("my") && (range === 1 || this.massAttackDamage(structureTargets) >= 10)) {
                this.rangedMassAttack();
            } else {
                this.rangedAttack(best);
            }
        }

        // melee attack
        if ((this.getPotential(ATTACK) > 0 || this.getPotential(WORK) > 0) && !this.isAttacking) {
            structureTargets = this.pos.findInRange(structureTargets, 1);
            let best = structureTargets[0];
            if (best) {
                this.attack(best);
                this.dismantle(best);
            }
        }
    }

    public standardTravel(roomName: string) {
        if (this.pos.roomName === roomName) {
            if (this.memory.traveled) { return false; }
            if (!this.pos.isNearExit(0)) {
                this.memory.traveled = true;
                return false;
            }
        } else {
            if (this.memory.traveled) {
                this.memory.traveled = undefined;
            }
        }
        this.travelToRoom(roomName, {ignoreRoads: true, ensurePath: true});
        return true;
    }

    public healSelf() {
        if (this.room.hostiles.length === 0) {
            if (this.hits < this.hitsMax) {
                this.heal(this);
            }
        } else {
            if (!this.isAttacking) {
                this.heal(this);
            }
        }
    }

    public healCreeps() {

        if (this.room.hostiles.length === 0) {
            if (this.hits < this.hitsMax) {
                this.heal(this);
            }
            return;
        }

        if (this.getPotential(HEAL) === 0) {
            return;
        }

        let conserveRanged = (this.isRangedAttacking || this.isRangedMassAttacking);
        let conserveHeal = (this.isAttacking || this.isDismantling);

        let bestHealScore = -Number.MAX_VALUE;
        let healTarget: Creep;
        for (let creep of this.pos.findInRange<Creep>(FIND_CREEPS, 3)) {
            let healScore = this.findHealScore(creep, conserveRanged, conserveHeal);
            if (healScore === undefined) { continue; }
            if (healScore > bestHealScore) {
                bestHealScore = healScore;
                healTarget = creep;
            }
        }

        if (healTarget) {
            this.healCreep(healTarget);
            return;
        }
    }

    protected healCreep(target: Creep) {
        let range = this.pos.getRangeTo(target);
        if (range > 1) {
            let outcome = this.rangedHeal(target);
            if (outcome === OK) {
                target.hitsTemp += this.getPotential(HEAL) / 3;
            }
        } else {
            let outcome = this.heal(target);
            if (outcome === OK) {
                target.hitsTemp += this.getPotential(HEAL);
            }
        }
    }

    private findHealScore(creep: Creep, conserveRanged: boolean, conserveHeal: boolean) {
        // heal allies
        if (!core.diplomat.allies[creep.owner.username]) {
            return;
        }

        if (CreepHelper.isCivilian(creep)) {
            return;
        }

        let expectedDamage = CreepHelper.expectedDamage(creep);
        let averageDamage = CreepHelper.averageDamage(creep);
        let actualDamage = creep.hitsMax - creep.hits;

        // shieldHits
        let shield = CreepHelper.shield(creep);

        // hitsTemp
        if (!creep.hitsTemp) {
            creep.hitsTemp = creep.hits;
        }
        let damageAfterHeals = creep.hitsMax - creep.hitsTemp;
        let range = this.pos.getRangeTo(creep);

        let emergency = shield.hits <= shield.hitsMax * .5 && damageAfterHeals > creep.hitsMax * .1;
        if (!emergency && ((conserveRanged && range > 1) || conserveHeal)) {
            return;
        }

        let rangePenalty = 0;
        if (range > 1) {
            rangePenalty = 1000;
        }
        let exitPenalty = 0;
        if (creep.pos.isNearExit(0)) {
            exitPenalty = 200;
        }

        return (actualDamage * 4) + damageAfterHeals - rangePenalty - exitPenalty + (expectedDamage / 2) + averageDamage;
    }

    public standardGoals(attackStructures: boolean): {approach: Goal[], avoid: Goal[]} {
        let goals = {approach: undefined, avoid: undefined };
        if (this.room.hostiles.length === 0) {
            if (attackStructures) {
                return this.structureGoals();
            } else {
                return goals;
            }
        }

        let hostilesInRoom = HostileAgent.findInRoom(this.room.name);

        if (hostilesInRoom.length === 0) {
            return this.civilianGoals();
        }

        let analysis: {[id: string]: {
            attack: number,
            rangedAttack: number,
            heal: number,
            advantage: boolean,
            prevDistanceDelta: number,
            currentDistanceDelta: number,
        }} = {};

        let myAttack = this.getPotential(ATTACK);
        let myRangedAttack = this.getPotential(RANGED_ATTACK);
        let myHealing = this.getPotential(HEAL);
        if (myHealing > 0 && myAttack + myRangedAttack === 0) {
            return this.healingGoals();
        }
        let preferCloseCombat = myAttack > 0;
        let myRating = CreepHelper.rating(this.creep);
        let nearbyRating = _.sum(this.pos.findInRange(this.room.friendlies, 6), x => CreepHelper.rating(x));
        let braveMode = this.hits * (nearbyRating / myRating) * .5 > this.hitsMax;

        let healers = [];
        for (let hostile of hostilesInRoom) {
            let attack = hostile.getPotential(ATTACK);
            let rangedAttack = hostile.getPotential(RANGED_ATTACK);
            let healing = hostile.getPotential(HEAL);
            if (healing > 0 && attack + rangedAttack === 0) {
                healers.push(hostile);
            }
            analysis[hostile.id] = {
                attack: attack,
                rangedAttack: rangedAttack,
                heal: healing,
                advantage: healing === 0 || attack + rangedAttack === 0 ||
                    myAttack + myRangedAttack - healing > attack + rangedAttack - myHealing,
                prevDistanceDelta: hostile.distanceDelta(this.previousPosition()),
                currentDistanceDelta: hostile.distanceDelta(this.pos),
            };
        }

        let approachTargets = hostilesInRoom;
        if (healers.length > 0) {
            approachTargets = healers;
        }

        let approachGoals: Goal[] = [];
        let avoidGoals: Goal[] = [];
        for (let target of approachTargets) {
            if (target.creep.owner.username === "Source Keeper") { continue; }
            let data = analysis[target.id];

            if (data.advantage || braveMode) {
                let range = 0;
                // ranged attackers who should keep at range
                if (!preferCloseCombat && (data.attack > 0 || data.rangedAttack > myAttack)) {
                    range = 3;
                    if (this.pos.getRangeTo(target) === 3 && data.prevDistanceDelta > 0) {
                        range = 2;
                    }
                    avoidGoals.push({pos: target.pos, range: range });
                }
                approachGoals.push({pos: target.pos, range: range });
            }
        }

        if (approachGoals.length === 0) {
            for (let friendly of this.room.friendlies) {
                approachGoals.push({pos: friendly.pos, range: 0});
            }
        }

        for (let target of hostilesInRoom) {
            let data = analysis[target.id];

            if (!data.advantage && !braveMode) {
                let range = 2;
                if (data.prevDistanceDelta < 0) {
                    range = 3;
                }
                if (data.rangedAttack > 0) {
                    range = 8;
                }
                avoidGoals.push({pos: target.pos, range: range });
            }
        }

        if (approachGoals.length > 0) {
            goals.approach = approachGoals;
        }

        if (avoidGoals.length > 0) {
            goals.avoid = avoidGoals;
        }

        return goals;
    }

    private civilianGoals(): {approach: Goal[], avoid: Goal[]} {
        let goals: Goal[] = [];
        for (let hostile of this.room.hostiles) {
            goals.push({pos: hostile.pos, range: 0});
        }
        return {approach: goals, avoid: undefined };
    }

    private retreatGoals(): Goal[] {
        let goals: Goal[] = [];
        // goals.push({pos: new RoomPosition(25, 25, this.pos.roomName), range: 30});

        for (let hostile of this.room.hostiles) {
            if (CreepHelper.getPotential(hostile, ATTACK) + CreepHelper.getPotential(hostile, RANGED_ATTACK) === 0) { continue; }
            goals.push({pos: hostile.pos, range: 10 });
        }

        if (this.room.controller && !this.room.controller.my && this.room.controller.level > 0) {
            for (let tower of this.room.findStructures<StructureTower>(STRUCTURE_TOWER)) {
                goals.push({pos: tower.pos, range: 50 });
            }
        }
        return goals;
    }

    public recover(): boolean {
        if (this.memory.recovering) {
            if (this.hits === this.hitsMax) {
                this.memory.recovering = undefined;
                return false;
            }
        } else {
            if (this.hits <= this.hitsMax * .7) {
                this.memory.recovering = true;
            } else {
                return false;
            }
        }

        let inDanger = this.pos.findInRange(this.room.hostiles, 5).length > 0
            || this.room.findStructures(STRUCTURE_TOWER).length > 0;
        if (inDanger) {
            this.memory.lastInDanger = Game.time;
        }

        let avoidGoals = this.retreatGoals();
        let outcome = this.maneuver(undefined, avoidGoals);
        if (outcome === undefined && this.pos.isNearExit(0)) {
            if (this.memory.lastInDanger + 3 > Game.time) {
                this.moveOffExit();
            }
        }

        return true;
    }

    private healingGoals(): {approach: Goal[], avoid: Goal[]} {
        let goals = {approach: undefined, avoid: undefined};

        let approachGoals: Goal[] = [];
        let avoidGoals: Goal[] = [];
        let healingPotential = this.getPotential(HEAL);
        let target = _(this.room.friendlies)
            .filter(x => x.hits < x.hitsMax)
            .min(x => x.hits + x.pos.getRangeTo(this) * 100);
        if (!_.isObject(target)) {
            target = _(this.room.friendlies)
                .min(x => {
                    let approachScore = (PosHelper.creepHealingAtPosition(x.pos) / healingPotential);
                    let range = x.pos.getRangeTo(this);
                    if (range === 0) {
                        approachScore += 100;
                    } else {
                        approachScore += range;
                    }
                    return approachScore;
                });
        }

        if (_.isObject(target)) {
            approachGoals.push({pos: target.pos, range: 0});
        }

        for (let hostile of this.room.hostiles) {
            if (CreepHelper.isCivilian(hostile)) { continue; }
            let range = 3;
            if (CreepHelper.getPotential(hostile, RANGED_ATTACK) > healingPotential) {
                range = 4;
            }
            avoidGoals.push({pos: hostile.pos, range: range });
        }

        if (approachGoals.length > 0) {
            goals.approach = approachGoals;
        }

        if (avoidGoals.length > 0) {
            goals.avoid = avoidGoals;
        }

        return goals;
    }

    public structureGoals(): {approach: Goal[], avoid: Goal[]} {
        let approachGoals: Goal[] = [];

        let approachRange = 3;
        if (this.getPotential(ATTACK) > 0 || this.getPotential(WORK) > 0) {
            approachRange = 1;
        }

        let structureTarget = this.findStructureTarget();
        if (structureTarget) {
            approachGoals.push({pos: structureTarget.pos, range: approachRange});
        }

        for (let structure of this.room.find<Structure>(FIND_STRUCTURES)) {
            approachGoals.push({pos: structure.pos, range: approachRange});
        }

        return {approach: approachGoals, avoid: undefined};
    }

    private findStructureTarget(): Structure {
        if (this.memory.structureTargetId) {
            let structure = Game.getObjectById<Structure>(this.memory.structureTargetId);
            if (structure && structure.pos.roomName === this.pos.roomName) {
                return structure;
            } else {
                delete this.memory.structureTargetId;
                return this.findStructureTarget();
            }
        } else {
            if (this.memory.nextStructureCheck > Game.time) { return; }

            let target = this.findBestStructure();
            if (target) {
                delete this.memory.nextStructureCheck;
                this.memory.nextStructureCheck = target.id;
                return target;
            } else {
                this.memory.nextStructureCheck = Game.time + 100;
            }
        }
    }

    private findBestStructure(): Structure {
        let walls: Structure[] = [];
        let covered: Structure[] = [];
        let uncovered: Structure[] = [];
        let approachGoals: Goal[] = [];
        for (let structure of this.room.find<Structure>(FIND_STRUCTURES)) {
            if (structure.structureType === STRUCTURE_ROAD || structure.structureType === STRUCTURE_CONTAINER) {
                continue;
            }
            if (structure.structureType === STRUCTURE_WALL || structure.structureType === STRUCTURE_RAMPART) {
                walls.push(structure);
                continue;
            }
            let rampart = structure.pos.lookForStructure(STRUCTURE_RAMPART);
            if (rampart && rampart.hits > 10000) {
                continue;
            }
            uncovered.push(structure);
            approachGoals.push({pos: structure.pos, range: 0});
        }

        if (walls.length === 0 && uncovered.length === 0) {
            return;
        }

        if (approachGoals.length > 0) {
            let ret = PathFinder.search(this.pos, approachGoals, {
                maxRooms: 1,
                roomCallback: roomName => {
                    if (roomName !== this.pos.roomName) { return false; }
                    let matrix = new PathFinder.CostMatrix();
                    for (let wall of walls) {
                        matrix.set(wall.pos.x, wall.pos.y, 0xff);
                    }
                    return matrix;
                },
            });

            let lastPos = _.last(ret.path);
            if (!ret.incomplete && lastPos) {
                let structure = _.filter(lastPos.lookFor<Structure>(LOOK_STRUCTURES), x => {
                    if (x.structureType === STRUCTURE_ROAD || x.structureType === STRUCTURE_CONTAINER) {
                        return false;
                    } else {
                        return true;
                    }
                })[0];
                if (structure) {
                    Notifier.log(`found unprotected structure: ${structure.structureType}`, 2);
                    return structure;
                }
            }
        }

        let targets = this.room.find<Structure>(FIND_HOSTILE_SPAWNS);
        if (targets.length === 0) {
            targets = covered;
        }

        if (targets.length === 0) {
            return;
        }

        approachGoals = [];
        for (let spawn of targets) {
            approachGoals.push({pos: spawn.pos, range: 0});
        }

        let maxWallHits = 10000;
        let highestWall = _.max(walls, x => x.hits);
        if (_.isObject(highestWall)) {
            maxWallHits = highestWall.hits;
        }

        let ret = PathFinder.search(this.pos, approachGoals, {
            maxRooms: 1,
            swampCost: 1,
            roomCallback: roomName => {
                if (roomName !== this.pos.roomName) { return false; }
                let matrix = new PathFinder.CostMatrix();
                for (let wall of walls) {
                    let cost = ((wall.hits / maxWallHits) * 100) + 100;
                    matrix.set(wall.pos.x, wall.pos.y, cost);
                }
                return matrix;
            },
        });

        for (let position of ret.path) {
            let wall = _.filter(position.lookFor<Structure>(LOOK_STRUCTURES), x => x.structureType !== STRUCTURE_ROAD)[0];
            if (wall) {
                Notifier.log(`attacking wall with hits: ${wall.hits}`, 2);
                return wall;
            }
        }
    }
}
