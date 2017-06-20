import {Mission, MissionMemory, MissionState} from "./Mission";
import {Operation} from "../operations/Operation";
import {Agent} from "../agents/Agent";
import {DefenseGuru} from "../DefenseGuru";
import {Guru} from "./Guru";
import {Scheduler} from "../../Scheduler";
import {Notifier} from "../../notifier";
import {helper} from "../../helpers/helper";

interface MasonMemory extends MissionMemory {
    needMason: boolean;
    sandbags: string;
    hazmatsLastTick: number;
    nukeData: {
        hazmatPositions: {[serializedPos: number]: number }
    };
}

interface MasonState extends MissionState {
    nukes: Nuke[];
    nukeRamparts: Rampart[];
    claimedRamparts: Rampart[];
    neededRepairRate: number;
    scheduledDeliveries: Creep[];
}

export class MasonMission extends Mission {

    private masons: Agent[];
    private hazmats: Agent[];
    private carts: Agent[];
    private hazmatCarts: Agent[];
    public defenseGuru: DefenseGuru;

    public memory: MasonMemory;
    public state: MasonState;

    private protectTypes = [STRUCTURE_TOWER, STRUCTURE_SPAWN, STRUCTURE_TERMINAL, STRUCTURE_LAB, STRUCTURE_NUKER];

    constructor(operation: Operation, defenseGuru: DefenseGuru) {
        super(operation, "mason");
        this.defenseGuru = defenseGuru;
    }

    public init() {
    }

    public update() {
        this.state.nukeRamparts = [];
        this.state.claimedRamparts = [];
        this.state.scheduledDeliveries = [];
        this.updateNukeData();
    }

    public maxMasons = () => {
        if (this.room.memory.layout.turtle) { return 2; }
        return 0;
    };

    public getMasonBody = () => {
        return this.bodyRatio(2, 2, 1, 1, 10);
    };

    public maxCarts = () => {
        return this.maxMasons() / 2;
    };

    public getCartBody = () => {
        return this.bodyRatio(0, 2, 1, 1, 16);
    };

    public getHazmatCartBody = () => {
        return this.bodyRatio(0, 4, 2);
    };

    public getMaxHazmat = () => {
        if (this.room.hostiles.length > 0) { return 0; }
        if (this.state.nukeRamparts.length > 0) {
            const max = 9;
            let needed = Math.ceil(this.state.neededRepairRate / 3000);
            if (needed > max) {
                console.log(`being overwhelmed by nukes in ${this.room.name}`);
            }
            return Math.min(max, needed);
        }
        return 0;
    };

    public maxHazmatCarts = () => {
        return Math.ceil(this.memory.hazmatsLastTick / 3);
    };

    public masonBoost(): string[] {
        return [RESOURCE_CATALYZED_LEMERGIUM_ACID];
    }

    public getHazmatBody = () => {
        return this.workerBody(24, 12, 12); // typical size: 20, 10, 15, should repair > 2,000,000 hits in a lifetime
    };

    public roleCall() {
        this.masons = this.headCount("mason", this.getMasonBody, this.maxMasons, {
            prespawn: 1,
            boosts: this.masonBoost(),
            allowUnboosted: true,
        });
        this.carts = this.headCount("masonCart", this.getCartBody, this.maxCarts);
        this.hazmatCarts = this.headCount("hazmatCart", this.getHazmatCartBody, this.maxHazmatCarts, {
            prespawn: 1,
        });
        this.hazmats = this.headCount("hazmat", this.getHazmatBody, this.getMaxHazmat, {
            boosts: [RESOURCE_CATALYZED_LEMERGIUM_ACID],
            allowUnboosted: true,
            prespawn: 1,
        });
        this.memory.hazmatsLastTick = this.roleCount("hazmat");
    }

    public actions() {

        for (let mason of this.masons) {
            if (this.defenseGuru.hostiles.length > 0) {
                this.warMasonActions(mason);
            } else {
                this.masonActions(mason);
            }
        }

        for (let hazmat of this.hazmats) {
            this.hazmatActions(hazmat);
        }

        for (let cart of this.carts) {
            this.masonCartActions(cart, this.masons);
        }

        for (let cart of this.hazmatCarts) {
            this.masonCartActions(cart, this.hazmats.concat(this.masons));
        }

        if (this.state.nukeRamparts.length > 0 && this.defenseGuru.hostiles.length === 0) {
            let lowestRampart = _(this.state.nukeRamparts)
                .filter(x => !x.pos.lookForStructure(STRUCTURE_EXTENSION))
                .sortBy(x => x.hits)
                .head();
            for (let tower of this.room.findStructures<StructureTower>(STRUCTURE_TOWER)) {
                this.towerActions(tower, lowestRampart);
            }
        }
    }

    public finalize() {
    }

    public invalidateCache() {
        this.memory.needMason = undefined;
    }

    private warMasonActions(mason: Agent) {
        let roomCallback = (roomName: string, matrix: CostMatrix) => {
            if (roomName !== this.room.name) { return; }
            let rangedAttackers = _(this.room.hostiles).filter(x => x.getActiveBodyparts(RANGED_ATTACK) > 0).value();
            for (let attacker of rangedAttackers) {
                helper.blockOffPosition(matrix, attacker, 3);
            }

            let attackers = _(this.room.hostiles).filter(x => x.getActiveBodyparts(RANGED_ATTACK) > 0).value();
            for (let attacker of attackers) {
                helper.blockOffPosition(matrix, attacker, 1, 0xff);
            }

            for (let rampart of this.room.findStructures<StructureRampart>(STRUCTURE_RAMPART)) {
                if (!rampart.pos.isPassible()) { continue; }
                matrix.set(rampart.pos.x, rampart.pos.y, 1);
            }

            return matrix;
        };

        let rampart = _(this.room.findStructures<StructureRampart>(STRUCTURE_RAMPART))
            .filter(x => _(x.pos.lookFor<Structure>(LOOK_STRUCTURES))
                .filter(y => y.structureType !== STRUCTURE_RAMPART && y.structureType !== STRUCTURE_ROAD)
                .value().length === 0)
            .sortBy(x => x.hits)
            .head();
        let flag = Game.flags[`${this.operation.name}_rampart`];
        if (flag) {
            let override = flag.pos.lookForStructure(STRUCTURE_RAMPART) as StructureRampart;
            if (override) {
                rampart = override;
            }
        }
        if (!rampart) {
            mason.idleOffRoad(this.spawnGroup.spawns[0]);
            return;
        }

        if (mason.pos.inRangeTo(rampart, 0)) {
            mason.memory.inPosition = true;
        } else {
            mason.travelTo(rampart, {roomCallback: roomCallback });
        }
        mason.repair(rampart);

        if (mason.hits < mason.hitsMax) {
            let tower = _(this.room.findStructures<StructureTower>(STRUCTURE_TOWER)).last();
            if (tower) {
                tower.heal(mason.creep);
            }
        }
    }

    private masonActions(agent: Agent) {

        let rampart = this.getRampart(agent);
        if (!rampart) {
            agent.idleOffRoad();
            return;
        }

        agent.memory.inPosition = true;
        let repOutcome = agent.creep.repair(rampart);
        if (repOutcome === ERR_NOT_IN_RANGE) {
            let other = agent.pos.findClosestByRange(this.room.findStructures<StructureRampart>(STRUCTURE_RAMPART));
            agent.creep.repair(other);
        }

        if (agent.isFull(300) || this.carts.length > 0) {
            agent.idleNear(rampart, 3, true);
            return;
        } else {
            let outcome = agent.retrieve(this.room.storage, RESOURCE_ENERGY);
            if (outcome === OK) {
                agent.travelTo(rampart);
            }
        }

    }

    private hazmatActions(hazmat: Agent) {

        let rampart = this.getRampartForHazmat(hazmat);
        if (!rampart) {
            hazmat.idleOffRoad(this.flag);
            rampart = hazmat.pos.findClosestByRange(this.room.findStructures<StructureRampart>(STRUCTURE_RAMPART));
            if (rampart) {
                hazmat.repair(rampart);
            }
            return;
        }

        let position = this.getHazmatPosition(rampart);
        if (!position) {
            hazmat.idleOffRoad(this.flag);
            rampart = hazmat.pos.findClosestByRange(this.room.findStructures<StructureRampart>(STRUCTURE_RAMPART));
            if (rampart) {
                hazmat.repair(rampart);
            }
            return;
        }
        if (hazmat.pos.inRangeTo(position, 0)) {
            hazmat.memory.inPosition = true;
            hazmat.stealNearby("creep");
            hazmat.repair(rampart);
        } else {
            hazmat.moveItOrLoseIt(position);
        }
    }

    private masonCartActions(agent: Agent, refillTargets: Agent[]) {

        let roomCallback = (roomName: string, matrix: CostMatrix) => {
            if (roomName !== this.room.name) { return false; }
            if (this.defenseGuru.hostiles.length === 0) { return; }
            let rangedAttackers = _(this.room.hostiles).filter(x => x.getActiveBodyparts(RANGED_ATTACK) > 0).value();
            for (let attacker of rangedAttackers) {
                helper.blockOffPosition(matrix, attacker, 3, 30, true);
            }

            let attackers = _(this.room.hostiles).filter(x => x.getActiveBodyparts(RANGED_ATTACK) > 0).value();
            for (let attacker of attackers) {
                helper.blockOffPosition(matrix, attacker, 1, 0xff);
            }

            for (let rampart of this.room.findStructures<StructureRampart>(STRUCTURE_RAMPART)) {
                if (rampart.pos.isPassible()) {
                    matrix.set(rampart.pos.x, rampart.pos.y, 1);
                }
            }

            // helper.showMatrix(matrix);

            return matrix;
        };

        if (agent.hits < agent.hitsMax) {
            let tower = _(this.room.findStructures<StructureTower>(STRUCTURE_TOWER)).last();
            if (tower) {
                tower.heal(agent.creep);
            }
        }

        let lowestMason = this.findLowest(agent, refillTargets);
        if (!lowestMason || !this.room.storage) {
            if (!agent.pos.lookForStructure(STRUCTURE_RAMPART)) {
                agent.fleeHostiles(4);
            }
            agent.idleOffRoad();
            return;
        }

        let hasLoad = agent.hasLoad();
        // if (hasLoad && agent.carry.energy < agent.carryCapacity / 4) {}
        if (!hasLoad) {
            if (agent.pos.isNearTo(this.room.storage)) {
                agent.withdraw(this.room.storage, RESOURCE_ENERGY);
                agent.travelTo(lowestMason, {roomCallback: roomCallback });
            } else {
                agent.travelTo(this.room.storage, {roomCallback: roomCallback });
            }
            return;
        }

        let outcome = agent.deliver(lowestMason, RESOURCE_ENERGY, {roomCallback: roomCallback });
        if (outcome === OK) {
            if (agent.carry.energy <= lowestMason.carryCapacity - lowestMason.carry.energy) {
                agent.travelTo(this.room.storage, {roomCallback: roomCallback });
            } else {
                agent.memory.masonId = undefined;
                lowestMason = this.findLowest(agent, refillTargets);
                if (lowestMason) {
                    agent.travelTo(lowestMason, {roomCallback: roomCallback });
                }
            }
        }
    }

    private findLowest(cart: Agent, agents: Agent[]): Creep {
        if (cart.memory.masonId) {
            let mason = Game.getObjectById<Creep>(cart.memory.masonId);
            if (mason && mason.carry.energy < mason.carryCapacity * .8) {
                this.state.scheduledDeliveries.push(mason);
                return mason;
            } else {
                cart.memory.masonId = undefined;
                return this.findLowest(cart, agents);
            }
        } else {
            let agent = _(agents)
                .filter(a => !_.includes(this.state.scheduledDeliveries, a.creep) && a.memory.inPosition
                && a.carry.energy < a.carryCapacity / 2)
                .sortBy((a: Agent) => a.pos.getRangeTo(cart))
                .head();
            if (agent) {
                this.state.scheduledDeliveries.push(agent.creep);
                cart.memory.masonId = agent.id;
                return agent.creep;
            } else {
                cart.memory.hasLoad = false;
            }
        }
    }

    get needMason() {
        if (!this.memory.needMason) {
            if (this.room.controller.level < 7) {
                this.memory.needMason = false;
            } else {
                const MIN_RAMPART_HITS = 50000000;
                let lowestRampart = _(this.room.findStructures<Structure>(STRUCTURE_RAMPART)).sortBy("hits").head();
                this.memory.needMason = lowestRampart && lowestRampart.hits < MIN_RAMPART_HITS;
            }
        }
        return this.memory.needMason;
    }

    private getRampart(agent: Agent): Structure {
        let findRampart = () => {
            let myRampart = _(this.room.findStructures<Structure>(STRUCTURE_RAMPART))
                .min(x => x.hits);
            if (_.isObject(myRampart)) { return myRampart; }
        };
        let forgetRampart = (s: Structure) => agent.creep.ticksToLive % 500 === 0;
        return agent.rememberStructure(findRampart, forgetRampart, "rampartId") as Structure;
    }

    private getExtension(agent: Agent, rampart: Structure): StructureExtension | StructureStorage {
        let fullExtensions = _.filter(this.room.findStructures<StructureExtension>(STRUCTURE_EXTENSION),
            (e: StructureExtension) => e.energy > 0);
        let extension = rampart.pos.findClosestByRange<StructureExtension>(fullExtensions);
        return agent.pos.findClosestByRange([this.room.storage, extension]);
    }

    private findConstruction(agent: Agent): ConstructionSite {
        return agent.pos.findClosestByRange<ConstructionSite>(FIND_MY_CONSTRUCTION_SITES);
    }

    private updateNukeData() {
        this.state.nukes = this.room.find<Nuke>(FIND_NUKES);
        if (this.state.nukes.length === 0) {
            delete this.memory.nukeData;
            return;
        } // with 27 rooms this only cost .1 cpu overhead total when no nukes
        let totalIncomingDamage = 0;

        for (let rampart of this.room.findStructures<Rampart>(STRUCTURE_RAMPART)) {
            // find ramparts in danger
            let incomingDamage = this.incomingNukeDamage(rampart.pos, this.state.nukes);
            if (incomingDamage === 0) { continue; }
            const margin = 5000000;
            incomingDamage += margin;
            incomingDamage -= rampart.hits;
            if (incomingDamage === 0) { continue; }
            totalIncomingDamage += incomingDamage;
            this.state.nukeRamparts.push(rampart);
        }

        let flagName = `evac_${this.name}_evac`;
        let flag = Game.flags[`evac_${this.name}_evac`];
        if (!flag) {
            console.log(`creating evac flag`);
            this.flag.pos.createFlag(flagName);
        }

        // find needed repair rate
        let soonestLanding = Number.MAX_VALUE;
        for (let nuke of this.state.nukes) {
            if (nuke.timeToLand < soonestLanding) {
                soonestLanding = nuke.timeToLand;
            }
        }
        this.state.neededRepairRate = totalIncomingDamage / soonestLanding;
        if (Game.time % 10 === 0) {
            console.log(`needed repair rate: ${this.state.neededRepairRate}`);
        }

        // deal with nuke memory
        if (!this.memory.nukeData) {
            this.memory.nukeData = {
                hazmatPositions: {},
            };
        }

        // put ramparts on important structures
        if (Math.random() > .1) { return; }
        let labCount = 0;
        for (let type of this.protectTypes) {
            let structures = this.room.findStructures<Structure>(type);
            for (let structure of structures) {
                if (type === STRUCTURE_LAB) {
                    if (labCount >= 8) { continue; }
                    labCount++;
                }
                if (structure.pos.lookForStructure(STRUCTURE_RAMPART)) { continue; }
                if (structure.pos.lookFor(LOOK_CONSTRUCTION_SITES).length > 0
                    && structure.pos.lookFor<ConstructionSite>(LOOK_CONSTRUCTION_SITES)[0].my) { continue; }
                if (this.incomingNukeDamage(structure.pos, this.state.nukes) > 0) {
                    structure.pos.createConstructionSite(STRUCTURE_RAMPART);
                }
            }
        }
    }

    private incomingNukeDamage(position: RoomPosition, nukes: Nuke[]): number {
        let damage = 0;
        for (let nuke of nukes) {
            let range = position.getRangeTo(nuke);
            if (range > 2) { continue; }
            if (range === 0) {
                damage += NUKE_DAMAGE[0];
                continue;
            }
            damage += NUKE_DAMAGE[2];
        }
        return damage;
    }

    private getRampartForHazmat(hazmat: Agent): Rampart {
        if (hazmat.memory.rampartId) {
            let rampart = Game.getObjectById<Rampart>(hazmat.memory.rampartId);
            if (rampart && !_.includes(this.state.claimedRamparts, rampart)) {
                this.state.claimedRamparts.push(rampart);
                return rampart;
            } else {
                delete hazmat.memory.rampartId;
                return this.getRampartForHazmat(hazmat);
            }
        } else {
            let ramparts = _.difference(this.state.nukeRamparts, this.state.claimedRamparts);
            if (ramparts.length === 0) { return; }
            hazmat.memory.rampartId = ramparts[0].id;
            this.state.claimedRamparts.push(ramparts[0]);
            return ramparts[0];
        }
    }

    private getHazmatPosition(rampart: Rampart): RoomPosition {
        let savedPos = this.memory.nukeData.hazmatPositions[this.room.serializePosition(rampart.pos)];
        if (savedPos) { return this.room.deserializePosition(savedPos); }

        let position = this.searchHazmatPosition(rampart);
        if (!position) {
            console.log(`MASON: no valid position found for hazmat, rampart at: ${rampart.pos}`);
            return;
        }

        let serializedRampartPos = this.room.serializePosition(rampart.pos);
        let serializedHazmatPos = this.room.serializePosition(position);
        this.memory.nukeData.hazmatPositions[serializedRampartPos] = serializedHazmatPos;
    }

    private searchHazmatPosition(rampart: Rampart): RoomPosition {
        let destroyableExtension: Structure;
        for (let radius = 0; radius <= 3; radius++) {
            for (let xDelta = -radius; xDelta <= radius; xDelta++) {
                for (let yDelta = -radius; yDelta <= radius; yDelta++) {
                    let position = new RoomPosition(rampart.pos.x + xDelta, rampart.pos.y + yDelta, this.room.name);
                    let extension = position.lookForStructure(STRUCTURE_EXTENSION);
                    if (extension) {
                        if (!destroyableExtension) { destroyableExtension = extension; }
                        continue;
                    }
                    if (!this.isValidHazmatPosition(position)) { continue; }
                    return position;
                }
            }
        }

        if (destroyableExtension) {
            Notifier.log(`MASON: destroying extension to make room for hazmat`);
            destroyableExtension.destroy();
            return destroyableExtension.pos;
        }
    }

    private isValidHazmatPosition(position: RoomPosition): boolean {
        if (position.isNearExit(1)) { return false; }
        if (!position.isPassible()) { return false; }
        if (position.lookForStructure(STRUCTURE_ROAD)) { return false; }
        if (this.room.storage && position.inRangeTo(this.room.storage, 1)) { return false; }
        let serializedPos = this.room.serializePosition(position);
        if (this.memory.nukeData.hazmatPositions[serializedPos]) { return false; } // check if being used
        return true;
    }

    private towerActions(tower: StructureTower, lowestRampart: StructureRampart) {
        if (!lowestRampart) { return; }
        tower.repair(lowestRampart);
    }
}
