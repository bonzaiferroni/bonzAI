import {Mission} from "./Mission";
import {Operation} from "../operations/Operation";
export class DefenseMission extends Mission {

    refillCarts: Creep[];
    defenders: Creep[];

    towers: StructureTower[];
    empties: StructureTower[];
    closestHostile: Creep;
    healedDefender: Creep;

    playerThreat: boolean;
    attackedCreep: Creep;
    enhancedBoost: boolean;
    likelyTowerDrainAttempt: boolean;

    healers: Creep[] = [];
    attackers: Creep[] = [];

    wallRamparts: StructureRampart[];
    jonRamparts: StructureRampart[];

    enemySquads = [];

    memory: {
        idlePosition: RoomPosition;
        unleash: boolean;
        disableSafeMode: boolean;
        wallCount: number;
        closestWallId: string;
        preSpawn: boolean
        lastCheckedTowers: number;
    };

    constructor(operation: Operation) {
        super(operation, "defense");
    }

    initMission() {
        this.towers = this.room.findStructures<StructureTower>(STRUCTURE_TOWER);

        this.analyzePlayerThreat();

        // nuke detection
        if (Game.time % 1000 === 1) {
            let nukes = this.room.find(FIND_NUKES) as Nuke[];
            for (let nuke of nukes) {
                console.log(`DEFENSE: nuke landing at ${this.opName} in ${nuke.timeToLand}`);
            }
        }

        // only gets triggered if a wall is breached
        this.triggerSafeMode();
    }

    roleCall() {
        let maxDefenders = 0;
        let maxRefillers = 0;
        if (this.playerThreat) {
            maxDefenders = Math.max(this.enemySquads.length, 1);
            maxRefillers = 1;
        }

        this.refillCarts = this.headCount("towerCart", () => this.bodyRatio(0, 2, 1, 1, 4), maxRefillers);

        let memory = { boosts: [RESOURCE_CATALYZED_KEANIUM_ALKALIDE, RESOURCE_CATALYZED_GHODIUM_ALKALIDE,
            RESOURCE_CATALYZED_UTRIUM_ACID], allowUnboosted: !this.enhancedBoost };

        if (this.enhancedBoost) {
            memory.boosts.push(RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE);
        }

        let defenderBody = () => {
            if (this.enhancedBoost) {
                let bodyUnit = this.configBody({[TOUGH]: 1, [ATTACK]: 3, [MOVE]: 1});
                let maxUnits = Math.min(this.spawnGroup.maxUnits(bodyUnit), 8);
                return this.configBody({[TOUGH]: maxUnits, [ATTACK]: maxUnits * 3, [RANGED_ATTACK]: 1, [MOVE]: maxUnits + 1});
            }
            else {
                let bodyUnit = this.configBody({[TOUGH]: 1, [ATTACK]: 5, [MOVE]: 6});
                let maxUnits = Math.min(this.spawnGroup.maxUnits(bodyUnit), 4);
                return this.configBody({[TOUGH]: maxUnits, [ATTACK]: maxUnits * 5, [MOVE]: maxUnits * 6});
            }
        };

        this.defenders = this.headCount("defender", defenderBody, maxDefenders, {prespawn: 1, memory: memory});
    }

    missionActions() {

        let order = 0;
        for (let defender of this.defenders) {
            this.defenderActions(defender, order);
            order++;
        }

        this.towerTargeting(this.towers);

        for (let cart of this.refillCarts) {
            this.towerCartActions(cart);
        }
    }

    finalizeMission() {
    }

    invalidateMissionCache() {
    }

    towerCartActions(cart: Creep) {

        let hasLoad = this.hasLoad(cart);
        if (!hasLoad) {
            this.procureEnergy(cart, this.findLowestEmpty(cart), true);
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
            cart.blindMoveTo(target, {maxRooms: 1});
            return;
        }

        // is near to target
        let outcome = cart.transfer(target, RESOURCE_ENERGY);
        if (outcome === OK && cart.carry.energy >= target.energyCapacity) {
            target = this.findLowestEmpty(cart, target);
            if (target && !cart.pos.isNearTo(target)) {
                cart.blindMoveTo(target, {maxRooms: 1});
            }
        }
    }

    findLowestEmpty(cart: Creep, pullTarget?: StructureTower): StructureTower {
        if (!this.empties) {
            this.empties = _(this.towers)
                .filter((s: StructureTower) => s.energy < s.energyCapacity)
                .sortBy("energy")
                .value() as StructureTower[];
        }

        if (pullTarget) {
            _.pull(this.empties, pullTarget);
        }

        return this.empties[0];
    }

    private defenderActions(defender: Creep, order: number) {
        if (this.enemySquads.length === 0) {
            this.moveToFlag(defender);
            defender.say("none :(");
            return; // early
        }

        // movement
        let dangerZone = false;
        if (this.memory.unleash) {
            let closest = defender.pos.findClosestByRange(this.room.hostiles);
            if (defender.pos.isNearTo(closest)) {
                if (defender.attack(closest) === OK) {
                    this.attackedCreep = closest;
                }
            }
            else {
                let outcome = defender.blindMoveTo(closest);
            }
        }
        else {

            let target = defender.pos.findClosestByRange(this.enemySquads[order % this.enemySquads.length]) as Creep;
            if (!target) {
                console.log("no target");
                return;
            }

            let closestRampart = target.pos.findClosestByRange(this.jonRamparts) as StructureRampart;
            if (closestRampart) {
                let currentRampart = defender.pos.lookForStructure(STRUCTURE_RAMPART) as StructureRampart;
                if (currentRampart && currentRampart.pos.getRangeTo(target) <= closestRampart.pos.getRangeTo(target)) {
                    closestRampart = currentRampart;
                }
                _.pull(this.jonRamparts, closestRampart);
                defender.blindMoveTo(closestRampart, { costCallback: this.preferRamparts });
            }
            else {
                defender.idleOffRoad(this.flag);
            }

            // attack
            if (defender.pos.isNearTo(target)) {
                 if (defender.attack(target) === OK) {
                     if (!this.attackedCreep || target.hits < this.attackedCreep.hits) {
                         this.attackedCreep = this.closestHostile;
                     }
                 }
            }
            else {
                let closeCreep = defender.pos.findInRange(this.room.hostiles, 1)[0] as Creep;
                if (closeCreep) {
                    if (defender.attack(closeCreep) === OK) {
                        this.attackedCreep = closeCreep;
                    }
                }
            }
        }

        // heal
        if (defender.hits < defender.hitsMax && (!this.healedDefender || defender.hits < this.healedDefender.hits)) {
            this.healedDefender = defender;
        }
    }

    private towerTargeting(towers: StructureTower[]) {
        if (!towers || towers.length === 0) return;

        for (let tower of this.towers) {

            let target = this.closestHostile;

            // kill jon snows target
            if (this.attackedCreep) {
                target = this.attackedCreep;
            }

            // healing as needed
            if (this.healedDefender) {
                tower.heal(this.healedDefender);
            }

            // the rest attack
            tower.attack(target);
        }
    }

    private triggerSafeMode() {
        if (this.playerThreat && !this.memory.disableSafeMode) {
            let wallCount = this.room.findStructures(STRUCTURE_WALL).concat(this.room.findStructures(STRUCTURE_RAMPART)).length;
            if (this.memory.wallCount && wallCount < this.memory.wallCount) {
                this.room.controller.activateSafeMode();
                this.memory.unleash = true;
            }
            this.memory.wallCount = wallCount;
        }
        else {
            this.memory.wallCount = undefined;
        }
    }

    preferRamparts = (roomName: string, matrix: CostMatrix) => {
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
            for (let rampart of this.wallRamparts) {
                matrix.set(rampart.pos.x, rampart.pos.y, 1);
            }
            return matrix;
        }
    };

    private closeToWall(creep: Creep): boolean {
        let wall = Game.getObjectById(this.memory.closestWallId) as Structure;
        if (wall && creep.pos.isNearTo(wall)) {
            return true;
        }
        else {
            let walls = this.room.findStructures(STRUCTURE_RAMPART) as Structure[];
            for (let wall of walls) {
                if (creep.pos.isNearTo(wall)) {
                    this.memory.closestWallId = wall.id;
                    return true;
                }
            }
        }
    }

    private analyzePlayerThreat() {
        if (this.towers.length > 0 && this.room.hostiles.length > 0) {
            this.closestHostile = this.towers[0].pos.findClosestByRange(this.room.hostiles);
        }

        let playerCreeps = _.filter(this.room.hostiles, (c: Creep) => {
            return c.owner.username !== "Invader" && c.body.length >= 40 && _.filter(c.body, part => part.boost).length > 0;
        }) as Creep[];

        this.playerThreat = playerCreeps.length > 1 || this.memory.preSpawn;

        if (this.playerThreat) {
            if (!Memory.roomAttacks) Memory.roomAttacks = {};
            Memory.roomAttacks[playerCreeps[0].owner.username] = Game.time;

            if (Game.time % 10 === 5) {
                console.log("DEFENSE: " + playerCreeps.length + " non-ally hostile creep in owned room: " + this.flag.pos.roomName);
            }

            for (let creep of this.room.hostiles) {
                if (creep.partCount(HEAL) > 12) {
                    this.healers.push(creep);
                }
                else {
                    this.attackers.push(creep);
                }
            }

            this.likelyTowerDrainAttempt = this.attackers.length === 0;
            this.wallRamparts = _.filter(this.room.findStructures(STRUCTURE_RAMPART), (r: StructureRampart) => {
                return _.filter(r.pos.lookFor(LOOK_STRUCTURES), (s: Structure) => {
                        return s.structureType !== STRUCTURE_ROAD;
                    }).length === 1;
            }) as StructureRampart[];
            this.jonRamparts = this.wallRamparts.slice(0);

            // find squads
            let attackers = _.sortBy(this.attackers, (c: Creep) => { this.towers[0].pos.getRangeTo(c); });
            while (attackers.length > 0) {
                let squad = attackers[0].pos.findInRange(attackers, 5);
                let nearbyRamparts = attackers[0].pos.findInRange(this.wallRamparts, 10);
                if (this.enemySquads.length === 0 || nearbyRamparts.length > 0) {
                    this.enemySquads.push(squad);
                }
                attackers = _.difference(attackers, squad);
            }

            this.enhancedBoost = this.room.terminal && this.room.terminal.store[RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE] > 1000;
        }
    }
}
