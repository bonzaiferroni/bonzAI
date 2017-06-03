import {Mission, MissionMemory, MissionState} from "./Mission";
import {Operation} from "../operations/Operation";
import {Agent} from "../agents/Agent";
import {Notifier} from "../../notifier";
import {Scheduler} from "../../Scheduler";
import {helper} from "../../helpers/helper";

interface DefenseMemory extends MissionMemory {
    idlePosition: RoomPosition;
    unleash: boolean;
    disableSafeMode: boolean;
    wallCount: number;
    closestWallId: string;
    lastCheckedTowers: number;
    loggedAttack: boolean;
    vulnerableIndex: number;
    targetIds: string[];
    targetHits: number;
    hitCount: number;
    healerTargetIndex: number;
    towerDrainDelay: number;
    lastProgress: number;
}

interface DefenseState extends MissionState {
    enemySquads: Creep[][];
    vulnerableCreep: Creep;
    assistTarget: Creep;
    openRamparts: Structure[];
    jonRamparts: Structure[];
    hostileHealers: Creep[];
    hostileAttackers: Creep[];
    enhancedBoost: boolean;
    likelyTowerDrainAttempt: boolean;
    playerThreat: boolean;
    attackedCreep: Creep;
    healedDefender: Agent;
    closestHostile: Creep;
    empties: StructureTower[];
}

export class DefenseMission extends Mission {

    private refillCarts: Agent[];
    private defenders: Agent[];
    private squadHealers: Agent[];
    private squadAttackers: Agent[];
    private towers: StructureTower[];

    public state: DefenseState;
    public memory: DefenseMemory;

    constructor(operation: Operation) {
        super(operation, "defense");
    }

    public init() {
    }

    public update() {
        this.towers = this.room.findStructures<StructureTower>(STRUCTURE_TOWER);

        this.analyzePlayerThreat();

        // nuke detection
        this.detectNuke();

        // only gets triggered if a wall is breached
        this.triggerSafeMode();
    }

    private getMaxDefenders = () => {
        // deprecated, will only spawn if unable to spawn the squad
        if (this.spawnGroup.maxSpawnEnergy > 8000) { return 0; }
        return this.state.playerThreat ? Math.max(this.state.enemySquads.length, 1) : 0;
    };
    private getMaxRefillers = () => this.state.playerThreat || this.room.find(FIND_NUKES).length > 0 ? 1 : 0;
    private getMaxSquadAttackers = () => this.state.playerThreat ? 1 : 0;
    private getMaxSquadHealers = () => this.state.playerThreat ? 1 : 0;

    private squadAttackerBody = () => {
        return this.configBody({[TOUGH]: 12, [MOVE]: 10, [ATTACK]: 27, [RANGED_ATTACK]: 1});
    };

    private squadHealerBody = () => {
        return this.configBody({[TOUGH]: 12, [MOVE]: 10, [HEAL]: 28});
    };

    private defenderBody = () => {
        if (this.state.enhancedBoost) {
            let bodyUnit = this.configBody({[TOUGH]: 1, [ATTACK]: 3, [MOVE]: 1});
            let maxUnits = Math.min(this.spawnGroup.maxUnits(bodyUnit), 8);
            return this.configBody({[TOUGH]: maxUnits, [ATTACK]: maxUnits * 3, [RANGED_ATTACK]: 1,
                [MOVE]: maxUnits + 1});
        } else {
            let bodyUnit = this.configBody({[TOUGH]: 1, [ATTACK]: 5, [MOVE]: 6});
            let maxUnits = Math.min(this.spawnGroup.maxUnits(bodyUnit), 4);
            return this.configBody({[TOUGH]: maxUnits, [ATTACK]: maxUnits * 5, [MOVE]: maxUnits * 6});
        }
    };

    public roleCall() {

        this.refillCarts = this.headCount("towerCart", () => this.bodyRatio(0, 2, 1, 1, 4), this.getMaxRefillers, {
            prespawn: 1,
        });

        let memory = { boosts: [RESOURCE_CATALYZED_KEANIUM_ALKALIDE, RESOURCE_CATALYZED_GHODIUM_ALKALIDE,
            RESOURCE_CATALYZED_UTRIUM_ACID], allowUnboosted: !this.state.enhancedBoost };

        if (this.state.enhancedBoost) {
            memory.boosts.push(RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE);
        }

        if (this.spawnGroup.maxSpawnEnergy < 8000 && this.operation.remoteSpawn && this.operation.remoteSpawn.spawnGroup
            && this.operation.remoteSpawn.spawnGroup.maxSpawnEnergy > 10000) {
            this.spawnGroup = this.operation.remoteSpawn.spawnGroup;
        }

        this.squadHealers = this.headCount("healer", this.squadHealerBody, this.getMaxSquadHealers, {
            allowUnboosted: false,
            skipMoveToRoom: true,
            memory: { boosts: [
                RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE,
                RESOURCE_CATALYZED_GHODIUM_ALKALIDE,
                RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE,
            ] },
        });

        this.squadAttackers = this.headCount("attacker", this.squadAttackerBody, this.getMaxSquadAttackers, {
            allowUnboosted: false,
            skipMoveToRoom: true,
            memory: { boosts: [
                RESOURCE_CATALYZED_UTRIUM_ACID,
                RESOURCE_CATALYZED_KEANIUM_ALKALIDE,
                RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE,
                RESOURCE_CATALYZED_GHODIUM_ALKALIDE,
            ] },
        });

        this.defenders = this.headCount("defender", this.defenderBody, this.getMaxDefenders,
            {prespawn: 1, memory: memory});
    }

    public actions() {
        let order = 0;
        for (let defender of this.defenders) {
            this.defenderActions(defender, order);
            order++;
        }

        for (let healer of this.squadHealers) {
            this.healerActions(healer);
        }

        for (let attacker of this.squadAttackers) {
            this.attackerActions(attacker);
        }

        this.towerTargeting(this.towers);

        for (let cart of this.refillCarts) {
            this.towerCartActions(cart);
        }
    }

    public finalize() {
    }

    public invalidateCache() {
    }

    private healerActions(healer: Agent) {
        let attacker = this.squadAttackers[0];
        if (this.squadAttackers.length === 0 || !attacker) {
            if (healer.hits < healer.hitsMax) {
                healer.heal(healer);
            }
            let fleeing = healer.fleeHostiles();
            if (!fleeing) {
                healer.idleOffRoad(this.flag);
            }
            return;
        }

        if (attacker.hits < attacker.hitsMax) {
            healer.heal(attacker);
        } else {
            healer.heal(healer);
        }

        if (healer.hits < healer.hitsMax) {
            this.state.healedDefender = healer;
        }
    }

    private attackerActions(attacker: Agent) {
        let roomCallback = (roomName: string, matrix: CostMatrix) => {
            if (roomName !== this.room.name) {
                if (attacker.room === this.room) {
                    return false;
                } else {
                    return;
                }
            }
            for (let hostile of this.room.hostiles) {
                let range = attacker.pos.getRangeTo(hostile);
                if (hostile.getActiveBodyparts(ATTACK) > 0) {
                    helper.blockOffPosition(matrix, hostile, 1, 90);
                } else if (hostile.getActiveBodyparts(RANGED_ATTACK) > 0) {
                    helper.blockOffPosition(matrix, hostile, 3, 20, true);
                }
            }

            for (let rampart of this.room.findStructures<StructureRampart>(STRUCTURE_RAMPART)) {
                if (!rampart.pos.isPassible()) { continue; }
                matrix.set(rampart.pos.x, rampart.pos.y, 1);
            }

            return matrix;
        };

        // attacking
        let target = this.findAttackerTarget(attacker);
        if (target) {
            let range = attacker.pos.getRangeTo(target);
            if (range <= 3) {
                attacker.rangedMassAttack();
                this.state.assistTarget = target;
            }
            if (range === 1) {
                attacker.attack(target);
                this.state.assistTarget = target;
            } else {
                let nearby = attacker.pos.findClosestByRange(this.room.hostiles);
                if (attacker.pos.isNearTo(nearby)) {
                    attacker.attack(nearby);
                    this.state.assistTarget = nearby;
                }
            }
        }

        let healer = this.squadHealers[0];
        if (this.squadHealers.length === 0 || !healer) {
            if (attacker.hits < attacker.hitsMax) {
                this.state.healedDefender = attacker;
            }
            attacker.idleOffRoad(this.flag);
            return;
        }

        if (!target) {
            attacker.idleOffRoad(this.flag);
            healer.idleOffRoad(this.flag);
            return;
        }

        let flag = Game.flags[`${this.operation.name}_attack`];
        if (flag) {
            Agent.squadTravel(attacker, healer, flag, {roomCallback: roomCallback});
        } else if (!target.pos.isNearExit(0)) {
            Agent.squadTravel(attacker, healer, target, {roomCallback: roomCallback});
        }

        if (attacker.room !== this.room && attacker.room !== healer.room) {
            attacker.travelTo(healer);
        }
    }

    private towerCartActions(cart: Agent) {

        let hasLoad = cart.hasLoad();
        if (!hasLoad) {
            cart.procureEnergy(this.findLowestEmpty(cart), true);
            return;
        }

        let target = this.findLowestEmpty(cart);
        if (!target) {
            cart.memory.hasLoad = cart.carry.energy === cart.carryCapacity;
            cart.yieldRoad(this.flag);
            return;
        }

        // has target
        if (!cart.pos.isNearTo(target)) {
            cart.travelTo(target);
            return;
        }

        // is near to target
        let outcome = cart.transfer(target, RESOURCE_ENERGY);
        if (outcome === OK && cart.carry.energy >= target.energyCapacity) {
            target = this.findLowestEmpty(cart, target);
            if (target && !cart.pos.isNearTo(target)) {
                cart.travelTo(target);
            }
        }
    }

    private findLowestEmpty(cart: Agent, pullTarget?: StructureTower): StructureTower {
        if (!this.state.empties) {
            this.state.empties = _(this.towers)
                .filter((s: StructureTower) => s.energy < s.energyCapacity)
                .sortBy("energy")
                .value() as StructureTower[];
        }

        if (pullTarget) {
            _.pull(this.state.empties, pullTarget);
        }

        return this.state.empties[0];
    }

    private defenderActions(defender: Agent, order: number) {

        let dangerZone = false;
        if (this.memory.unleash) {
            let closest = defender.pos.findClosestByRange(this.room.hostiles);
            if (defender.pos.isNearTo(closest)) {
                if (defender.attack(closest) === OK) {
                    this.state.attackedCreep = closest;
                }
            } else {
                let outcome = defender.travelTo(closest);
            }
            return;
        }

        if (this.state.enemySquads.length === 0) {
            defender.idleOffRoad();
            defender.say("none :(");
            return; // early
        }

        // movement
        let target = defender.pos.findClosestByRange<Creep>(
            this.state.enemySquads[order % this.state.enemySquads.length]);
        if (!target) {
            console.log("no target");
            return;
        }

        let closestRampart = target.pos.findClosestByRange(this.state.jonRamparts) as Structure;
        if (closestRampart) {
            let currentRampart = defender.pos.lookForStructure(STRUCTURE_RAMPART) as Structure;
            if (currentRampart && currentRampart.pos.getRangeTo(target) <= closestRampart.pos.getRangeTo(target)) {
                closestRampart = currentRampart;
            }
            _.pull(this.state.jonRamparts, closestRampart);
            defender.travelTo(closestRampart, { roomCallback: this.preferRamparts });
        } else {
            defender.idleOffRoad(this.flag);
        }

        // attack
        if (defender.pos.isNearTo(target)) {
            if (defender.attack(target) === OK) {
                if (!this.state.attackedCreep || target.hits < this.state.attackedCreep.hits) {
                    this.state.attackedCreep = target;
                }
            }
        } else {
            let closeCreep = defender.pos.findInRange(this.room.hostiles, 1)[0] as Creep;
            if (closeCreep) {
                if (defender.attack(closeCreep) === OK) {
                    this.state.attackedCreep = closeCreep;
                }
            }
        }

        // heal
        if (defender.hits < defender.hitsMax && (!this.state.healedDefender ||
            defender.hits < this.state.healedDefender.hits)) {
            this.state.healedDefender = defender;
        }
    }

    private towerTargeting(towers: StructureTower[]) {
        if (!towers || towers.length === 0) { return; }
        // if (this.likelyTowerDrainAttempt) { return; }

        // reini targeting works most of the time
        let targets = this.reiniTargeting();
        let healedAmount = 0;
        if (!targets || targets.length === 0) { return; }
        let lowestRampart = _(this.room.findStructures<StructureRampart>(STRUCTURE_RAMPART))
            .sortBy(x => x.hits).head();
        let lowestFriendly = _(this.room.find<Creep>(FIND_MY_CREEPS))
            .filter(x => x.hits < x.hitsMax)
            .min(x => x.hits);

        let attackMode = !this.state.playerThreat || this.state.assistTarget || this.state.vulnerableCreep
            || !this.memory.lastProgress || Game.time < this.memory.lastProgress + 25;

        for (let i = 0; i < towers.length; i++) {
            let target = targets[i % targets.length];
            let tower = towers[i];

            // kill npcs or just very close creeps
            if (!this.state.playerThreat) {
                target = this.state.closestHostile;
            }

            // kill vulnerable creeps (have no healer) if not too far away
            if (this.state.vulnerableCreep) {
                target = this.state.vulnerableCreep;
            }

            // healing as needed
            if (this.state.healedDefender && tower.energy >= 10 &&
                this.state.healedDefender.hits < this.state.healedDefender.hitsMax - healedAmount) {
                healedAmount += 300;
                tower.heal(this.state.healedDefender.creep);
                continue;
            }

            // the rest attack
            if (attackMode) {
                tower.attack(target);
            } else {
                if (_.isObject(lowestFriendly) && lowestFriendly.hits < lowestFriendly.hitsMax - healedAmount) {
                    healedAmount += 300;
                    tower.heal(lowestFriendly);
                } else {
                    tower.repair(lowestRampart);
                }
                this.memory.targetIds = undefined;
            }
        }
    }

    /*
     private towerTargeting(towers: StructureTower[]) {
     if (!towers || towers.length === 0) { return; }

     for (let tower of this.towers) {

     let target = this.closestHostile;

     // kill jon snows target
     if (this.attackedCreep) {
     target = this.attackedCreep;
     }

     // healing as needed
     if (this.healedDefender) {
     tower.heal(this.healedDefender.creep);
     }

     // the rest attack
     tower.attack(target);
     }
     }
     */

    private triggerSafeMode() {
        if (this.state.playerThreat && !this.memory.disableSafeMode) {
            let wallCount = this.room.findStructures(STRUCTURE_WALL)
                .concat(this.room.findStructures(STRUCTURE_RAMPART)).length;
            if (this.memory.wallCount && wallCount < this.memory.wallCount) {
                this.room.controller.activateSafeMode();
            }
            this.memory.wallCount = wallCount;
        } else {
            this.memory.wallCount = undefined;
        }
    }

    private preferRamparts = (roomName: string, matrix: CostMatrix) => {
        if (roomName === this.room.name) {

            // block off hostiles and adjacent squares
            for (let hostile of this.room.hostiles) {
                matrix.set(hostile.pos.x, hostile.pos.y, 0xff);
                for (let i = 1; i <= 8; i++) {
                    let position = hostile.pos.getPositionAtDirection(i);
                    matrix.set(position.x, position.y, 0xff);
                }
            }

            // set rampart costs to same as road
            for (let rampart of this.state.openRamparts) {
                matrix.set(rampart.pos.x, rampart.pos.y, 1);
            }
            return matrix;
        }
    };

    private closeToWall(creep: Creep): boolean {
        let wall = Game.getObjectById(this.memory.closestWallId) as Structure;
        if (wall && creep.pos.isNearTo(wall)) {
            return true;
        } else {
            let ramparts = this.room.findStructures(STRUCTURE_RAMPART) as Structure[];
            for (let rampart of ramparts) {
                if (creep.pos.isNearTo(rampart)) {
                    this.memory.closestWallId = rampart.id;
                    return true;
                }
            }
        }
    }

    private analyzePlayerThreat() {
        if (this.towers.length > 0 && this.room.hostiles.length > 0) {
            this.state.closestHostile = this.towers[0].pos.findClosestByRange(this.room.hostiles);
        }

        let playerCreeps = this.findPlayerCreeps();

        this.state.playerThreat = playerCreeps.length > 0;

        // Notifier reporting
        this.updateAttackLog(playerCreeps);

        if (this.state.playerThreat) {
            if (!Memory.roomAttacks) { Memory.roomAttacks = {}; }
            Memory.roomAttacks[playerCreeps[0].owner.username] = Game.time;

            // console report
            if (Game.time % 10 === 5) {
                console.log("DEFENSE: " + playerCreeps.length + " non-ally hostile creep in owned missionRoom: " +
                    this.flag.pos.roomName);
            }

            this.state.hostileHealers = [];
            this.state.hostileAttackers = [];
            for (let creep of this.room.hostiles) {
                if (creep.partCount(HEAL) > 12) {
                    this.state.hostileHealers.push(creep);
                } else {
                    this.state.hostileAttackers.push(creep);
                }
            }

            this.state.likelyTowerDrainAttempt = this.isTowerDrain();
            this.state.openRamparts = this.findOpenRamparts();
            this.state.jonRamparts = this.state.openRamparts.slice(0);

            // find squads
            this.updateEnemySquads();
            this.updateVulnerableCreep();

            this.state.enhancedBoost = this.room.terminal &&
                this.room.terminal.store[RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE] > 1000;
        }
    }

    private findOpenRamparts() {
        return _.filter(this.room.findStructures(STRUCTURE_RAMPART), (r: Structure) => {
            return _.filter(r.pos.lookFor(LOOK_STRUCTURES), (s: Structure) => {
                    return s.structureType !== STRUCTURE_ROAD;
                }).length === 1;
        }) as Structure[];
    }

    private updateEnemySquads() {
        this.state.enemySquads = [];
        let attackers = _.sortBy(this.state.hostileAttackers, (c: Creep) => { this.towers[0].pos.getRangeTo(c); });
        while (attackers.length > 0) {
            let squad = attackers[0].pos.findInRange(attackers, 5);
            let nearbyRamparts = attackers[0].pos.findInRange(this.state.openRamparts, 10);
            if (this.state.enemySquads.length === 0 || nearbyRamparts.length > 0) {
                this.state.enemySquads.push(squad);
            }
            attackers = _.difference(attackers, squad);
        }
    }

    private updateAttackLog(playerCreeps: Creep[]) {
        if (this.state.playerThreat && !this.memory.loggedAttack) {
            Notifier.log(`DEFENSE: Attacked: ${this.room.name}, Time:${Game.time}, Player: ${
                playerCreeps[0].owner.username}`);
            this.memory.loggedAttack = true;
        } else if (!this.state.playerThreat && this.memory.loggedAttack) {
            this.memory.loggedAttack = false;
        }
    }

    private findPlayerCreeps(): Creep[] {
        return _.filter(this.room.hostiles, (c: Creep) => {
            return c.owner.username !== "Invader" && c.body.length >= 30 &&
                _.filter(c.body, part => part.boost).length > 0;
        }) as Creep[];
    }

    private detectNuke() {
        if (Scheduler.delay(this.memory, "detectNuke", 100)) { return; }
        let nukes = this.room.find(FIND_NUKES) as Nuke[];
        for (let nuke of nukes) {
            console.log(`DEFENSE: nuke landing at ${this.operation.name} in ${nuke.timeToLand}`);
        }
    }

    private updateVulnerableCreep() {
        let attackersInRange = this.towers[0].pos.findInRange(this.state.hostileAttackers, 20);
        if (attackersInRange.length === 0) { return; }

        if (this.memory.vulnerableIndex === undefined || this.memory.vulnerableIndex >= attackersInRange.length ) {
            this.memory.vulnerableIndex = 0;
        }

        let analyzedCreep = attackersInRange[this.memory.vulnerableIndex];

        let rangeToHealer = 0;
        let closestHealer = analyzedCreep.pos.findClosestByRange(this.state.hostileHealers) as Creep;
        if (closestHealer) {
            rangeToHealer = analyzedCreep.pos.getRangeTo(closestHealer);
        }

        if (rangeToHealer > 2) {
            // focus on this creep while conditions are met
            this.state.vulnerableCreep = analyzedCreep;
        } else {
            // look for another creep next tick
            this.memory.vulnerableIndex++;
        }
    }

    private reiniTargeting() {
        if (this.memory.targetIds) {
            let targets = [];
            for (let id of this.memory.targetIds) {
                let target = Game.getObjectById(id) as Creep;
                if (target && target.room === this.room) {
                    targets.push(target);
                }
            }
            if (targets.length === 0) {
                this.memory.targetIds = undefined;
                this.memory.targetHits = undefined;
                this.memory.hitCount = undefined;
                return this.reiniTargeting();
            }
            if (targets.length === 1) {
                let target = targets[0];
                if (this.state.assistTarget) {
                    targets = [this.state.assistTarget];
                    target = this.state.assistTarget;
                }

                if (this.memory.hitCount === 0) {
                    if (target.hits >= this.memory.targetHits) {
                        this.memory.targetIds = undefined;
                        this.memory.targetHits = undefined;
                        this.memory.hitCount = undefined;
                        return this.reiniTargeting();
                    } else {
                        this.memory.lastProgress = Game.time;
                    }
                }

                if (!this.memory.hitCount) { this.memory.hitCount = 2; }
                this.memory.hitCount--;
                this.memory.targetHits = target.hits;
            } else {
                this.memory.targetIds = _(this.memory.targetIds)
                    .shuffle()
                    .take(Math.ceil(this.memory.targetIds.length / 2))
                    .value();
            }
            return targets;
        } else {
            if (this.room.hostiles.length > 0) {

                let targets = this.assistTargeting();

                if (!targets) {
                    targets = this.healerTargeting();
                }
                if (!targets) {
                    targets = this.room.hostiles;
                }

                let orientation = this.squadAttackers[0] || this.towers[0];

                this.memory.targetIds = _(targets)
                    .sortBy((c: Creep) => orientation.pos.getRangeTo(c))
                    .take(this.towers.length)
                    .map((c: Creep) => c.id)
                    .value();
                return this.reiniTargeting();
            }
        }
    }

    private healerTargeting(): Creep[] {
        try {
            let nearbyHealers = this.towers[0].pos.findInRange(this.state.hostileHealers, 10);
            if (nearbyHealers.length === 0) { return; }
            if (this.memory.healerTargetIndex >= nearbyHealers.length) {
                this.memory.healerTargetIndex = 0;
            }

            return nearbyHealers[this.memory.healerTargetIndex++].pos.findInRange(this.room.hostiles, 3);
        } catch (e) {
            console.log(`error in healerTargeting`);
        }
    }

    private isTowerDrain() {
        if (this.state.hostileAttackers.length > 0) { return false; }
        if (Game.time < this.memory.towerDrainDelay) { return true; }
        for (let creep of this.state.hostileHealers) {
            if (this.towers[0].pos.getRangeTo(creep) > 20) { continue; }
            this.memory.towerDrainDelay = Game.time + 20;
            return true;
        }
    }

    private assistTargeting() {
        if (this.state.assistTarget) {
            return this.state.assistTarget.pos.findInRange(this.room.hostiles, 3);
        }
    }

    private findAttackerTarget(attacker: Agent) {
        if (attacker.memory.targetId) {
            let target = Game.getObjectById<Creep>(attacker.memory.targetId);
            if (target && target.room === this.room && Game.time < attacker.memory.targetCheck) {
                return target;
            } else {
                attacker.memory.targetId = undefined;
                return this.findAttackerTarget(attacker);
            }
        } else {
            let target = this.findSafest(attacker);
            if (target) {
                attacker.memory.targetId = target.id;
                attacker.memory.targetCheck = Game.time + 50;
                return target;
            }
        }
    }

    private findLeastHealed(orientation: {pos: RoomPosition}): Creep {
        if (!orientation) { return; }

        let leastHealed: Creep;
        let lowestHealerCount = Number.MAX_VALUE;
        for (let hostile of this.room.hostiles) {
            let healerCount = _.filter(hostile.pos.findInRange(this.room.hostiles, 3),
                x => x.getActiveBodyparts(HEAL) > 0).length;
            if (healerCount > lowestHealerCount) { continue; }
            if (healerCount > lowestHealerCount) { continue; }
            lowestHealerCount = healerCount;
            leastHealed = hostile;
        }

        return leastHealed;
    }

    private findSafest(orientation: {pos: RoomPosition}): Creep {
        if (!orientation) { return; }

        let safest: Creep;
        let lowestrangedAttackerCount = Number.MAX_VALUE;
        for (let hostile of _(this.room.hostiles).sortBy(x => x.pos.getRangeTo(orientation)).value()) {
            let rangedAttackerCount = _.filter(hostile.pos.findInRange(this.room.hostiles, 3),
                x => x.getActiveBodyparts(RANGED_ATTACK) > 0).length;
            if (rangedAttackerCount >= lowestrangedAttackerCount) { continue; }
            lowestrangedAttackerCount = rangedAttackerCount;
            safest = hostile;
        }

        return safest;
    }
}
