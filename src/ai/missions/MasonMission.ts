import {Mission} from "./Mission";
import {Operation} from "../operations/Operation";
import {Agent} from "./Agent";
import {DefenseGuru} from "../DefenseGuru";
import {Guru} from "./Guru";
import {Scheduler} from "../../Scheduler";
import {notifier} from "../../notifier";

const SANDBAG_THRESHOLD = 1000000;

export class MasonMission extends Mission {

    public masons: Agent[];
    public hazmats: Agent[];
    public carts: Agent[];
    public defenseGuru: DefenseGuru;

    private _sandbags: RoomPosition[];
    private nukes: Nuke[];
    private nukeRamparts: Rampart[] = [];
    private claimedRamparts: Rampart[] = [];
    private neededRepairRate: number;
    private scheduledDeliveries: Agent[] = [];

    public memory: {
        needMason: boolean;
        sandbags: string;
        nukeData: {
            hazmatPositions: {[serializedPos: number]: number }
        }
    };

    constructor(operation: Operation, defenseGuru: DefenseGuru) {
        super(operation, "mason");
        this.defenseGuru = defenseGuru;
    }

    public initMission() {
        this.updateNukeData();
    }

    public maxMasons = () => {
        return this.needMason ? Math.ceil(this.room.storage.store.energy / 500000) : 0;
    };

    public getMasonBody = () => {
        return this.workerBody(16, 8, 12);
    };

    public maxCarts = () => {
        if (this.nukeRamparts.length > 0) { return Math.ceil(this.getMaxHazmat() / 3); }
        if (this.needMason && this.defenseGuru.hostiles.length > 0) {
            return 1;
        } else {
            return 0;
        }
    };

    public getCartBody = () => {
        if (this.nukeRamparts.length > 0) {
            return this.bodyRatio(0, 4, 2);
        } else {
            return this.workerBody(0, 4, 2);
        }
    };

    public getMaxHazmat = () => {
        if (this.nukeRamparts.length > 0) {
            const max = 10;
            let needed = Math.ceil(this.neededRepairRate / 1800);
            if (needed > max) {
                console.log(`being overwhelmed by nukes in ${this.room.name}`);
            }
            return Math.min(max, needed);
        }
        return 0;
    };

    public getHazmatBody = () => {
        return this.bodyRatio(4, 2, 3); // typical size: 20, 10, 15, should repair > 2,000,000 hits in a lifetime
    };

    public roleCall() {
        this.masons = this.headCount("mason", this.getMasonBody, this.maxMasons, {
            prespawn: 1,
        });
        this.carts = this.headCount("masonCart", this.getCartBody, this.maxCarts);
        this.hazmats = this.headCount("hazmat", this.getHazmatBody, this.getMaxHazmat, {
            boosts: [RESOURCE_CATALYZED_LEMERGIUM_ACID],
            allowUnboosted: true,
            prespawn: 1,
        });
    }

    public missionActions() {

        for (let mason of this.masons) {
            this.masonActions(mason);
        }

        for (let hazmat of this.hazmats) {
            this.hazmatActions(hazmat);
        }

        for (let cart of this.carts) {
            this.masonCartActions(cart);
        }
    }

    public finalizeMission() {
    }

    public invalidateMissionCache() {
        this.memory.needMason = undefined;
    }

    private masonActions(agent: Agent) {

        let rampart = this.getRampart(agent);
        if (!rampart) {
            agent.idleOffRoad();
            return;
        }

        agent.creep.repair(rampart);

        let stolen = false;
        if (!agent.isFull(200)) {
            stolen = agent.stealNearby(STRUCTURE_EXTENSION) === OK;
        }

        if (agent.isFull(300) || stolen) {
            agent.idleNear(rampart, 3, true);
            return;
        } else {
            let extension = this.getExtension(agent, rampart);
            let outcome = agent.retrieve(extension, RESOURCE_ENERGY);
            if (outcome === OK && !agent.creep.pos.inRangeTo(rampart, 3)) {
                agent.travelTo(rampart);
            }
        }
    }

    private hazmatActions(hazmat: Agent) {
        let rampart = this.getRampartForHazmat(hazmat);
        if (!rampart) { this.masonActions(hazmat); }
        let position = this.getHazmatPosition(rampart);
        if (!position) { this.masonActions(hazmat); }
        hazmat.travelTo(position);
        hazmat.repair(rampart);
    }

    private sandbagActions(agent: Agent) {

        if (agent.creep.ticksToLive > 400 &&
            !agent.creep.body.find((p: BodyPartDefinition) => p.boost === RESOURCE_CATALYZED_LEMERGIUM_ACID)) {
            if (this.room.terminal && this.room.terminal.store[RESOURCE_CATALYZED_LEMERGIUM_ACID] > 1000) {
                agent.resetPrep();
            }
        }

        let construction = this.findConstruction(agent);
        if (construction) {
            agent.travelToAndBuild(construction);
            return;
        }

        let emergencySandbag = this.getEmergencySandbag(agent);
        if (emergencySandbag) {
            if (agent.pos.inRangeTo(emergencySandbag, 3)) {
                agent.creep.repair(emergencySandbag);
            } else {
                agent.travelTo(emergencySandbag);
            }
        }
    }

    private masonCartActions(agent: Agent) {

        let lowestMason = this.findLowest(this.hazmats);
        if (!lowestMason) {
            lowestMason = this.findLowest(this.masons);
        }
        if (!lowestMason || !this.room.storage) {
            agent.idleOffRoad();
            return;
        }

        if (agent.isFull()) {
            let outcome = agent.deliver(lowestMason.creep, RESOURCE_ENERGY);
            if (outcome === OK) {
                agent.travelTo(this.room.storage);
            }
        } else {
            let outcome = agent.retrieve(this.room.storage, RESOURCE_ENERGY);
            if (outcome === OK) {
                agent.travelTo(lowestMason);
            }
        }
    }

    private findLowest(agents: Agent[]): Agent {
        let agent = _(agents)
            .filter(a => !_.includes(this.scheduledDeliveries, a))
            .sortBy((a: Agent) => a.creep.carry.energy)
            .head();
        this.scheduledDeliveries.push(agent);
        return agent;
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

    get sandbags(): RoomPosition[] {
        if (!this._sandbags) {
            if (!this.memory.sandbags) {
                let sandbags = this.findSandbags();
                this.memory.sandbags = Guru.serializePositions(sandbags);
            }
            this._sandbags = Guru.deserializePositions(this.memory.sandbags, this.room.name);
        }
        return this._sandbags;
    }

    private getEmergencySandbag(agent: Agent): Structure {

        let emergencyThreshold = SANDBAG_THRESHOLD / 10;

        let nextConstruction: RoomPosition[] = [];
        for (let sandbag of this.sandbags) {
            let rampart = sandbag.lookForStructure(STRUCTURE_RAMPART);
            if (rampart && rampart.hits < emergencyThreshold) {
                return rampart;
            }
            if (!rampart) {
                nextConstruction.push(sandbag);
            }
        }

        if (this.room.find(FIND_CONSTRUCTION_SITES).length > 0) { return; }

        let bestPosition = agent.pos.findClosestByRange(this.defenseGuru.hostiles)
            .pos.findClosestByRange(nextConstruction);
        if (bestPosition) {
            bestPosition.createConstructionSite(STRUCTURE_RAMPART);
        }
    }

    private findSandbags(): RoomPosition[] {

        let leftBound = 50;
        let rightBound = 0;
        let topBound = 50;
        let bottomBound = 0;
        let wallRamparts = [];
        for (let rampart of this.room.findStructures<Structure>(STRUCTURE_RAMPART)) {
            if (rampart.pos.lookForStructure(STRUCTURE_ROAD)) { continue; }
            if (rampart.pos.lookForStructure(STRUCTURE_EXTENSION)) { continue; }
            wallRamparts.push(rampart);
            if (rampart.pos.x < leftBound) { leftBound = rampart.pos.x; }
            if (rampart.pos.x > rightBound) { rightBound = rampart.pos.x; }
            if (rampart.pos.y < topBound) { topBound = rampart.pos.y; }
            if (rampart.pos.y > bottomBound) { bottomBound = rampart.pos.y; }
        }

        console.log(leftBound, rightBound, topBound, bottomBound);

        let sandbags = [];
        for (let structure of this.room.find<Structure>(FIND_STRUCTURES)) {
            if (structure.structureType === STRUCTURE_RAMPART) { continue; }
            if (structure.pos.lookForStructure(STRUCTURE_RAMPART)) { continue; }
            let nearbyRampart = structure.pos.findInRange(wallRamparts, 2)[0];
            if (!nearbyRampart) { continue; }
            if (structure.pos.x < leftBound || structure.pos.x > rightBound) { continue; }
            if (structure.pos.y < topBound || structure.pos.y > bottomBound) { continue; }
            sandbags.push(structure.pos);
        }

        return sandbags;
    }

    private getRampart(agent: Agent): Structure {
        let findRampart = () => {
            let lowestHits = 100000;
            let lowestRampart = _(this.room.findStructures<Structure>(STRUCTURE_RAMPART)).sortBy("hits").head();
            if (lowestRampart) {
                lowestHits = lowestRampart.hits;
            }
            let myRampart = _(this.room.findStructures<Structure>(STRUCTURE_RAMPART))
                .filter((s: Structure) => s.hits < lowestHits + 100000)
                .sortBy((s: Structure) => agent.pos.getRangeTo(s))
                .head();
            if (myRampart) { return myRampart; }
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
        this.nukes = this.room.find<Nuke>(FIND_NUKES);
        if (this.nukes.length === 0) { return; } // with 27 rooms this only cost .1 cpu overhead total when no nukes
        let totalIncomingDamage = 0;
        for (let rampart of this.room.findStructures<Rampart>(STRUCTURE_RAMPART)) {
            // find ramparts in danger
            let incomingDamage = this.incomingNukeDamage(rampart.pos, this.nukes);
            const margin = 10000000;
            incomingDamage = rampart.hits - incomingDamage + margin;
            if (incomingDamage > 0) {
                totalIncomingDamage += incomingDamage;
                this.nukeRamparts.push(rampart);
            }
        }

        // find needed repair rate
        let soonestLanding = Number.MAX_VALUE;
        for (let nuke of this.nukes) {
            if (nuke.timeToLand < soonestLanding) {
                soonestLanding = nuke.timeToLand;
            }
        }
        this.neededRepairRate = totalIncomingDamage / soonestLanding;
        console.log(`needed repair rate: ${this.neededRepairRate}`);

        // deal with nuke memory
        if (totalIncomingDamage > 0) {
            if (!this.memory.nukeData) {
                this.memory.nukeData = {
                    hazmatPositions: {},
                };
            }
        } else {
            // clean up when finished
            delete this.memory.nukeData;
        }

        // put ramparts on important structures
        if (Math.random() > .1) { return; }
        const types = [STRUCTURE_TOWER, STRUCTURE_SPAWN, STRUCTURE_TERMINAL, STRUCTURE_LAB];
        for (let type of types) {
            let structures = this.room.findStructures<Structure>(type);
            for (let structure of structures) {
                if (structure.pos.lookForStructure(STRUCTURE_RAMPART)) { continue; }
                if (structure.pos.lookFor(LOOK_CONSTRUCTION_SITES).length > 0
                    && structure.pos.lookFor<ConstructionSite>(LOOK_CONSTRUCTION_SITES)[0].my) { continue; }
                if (this.incomingNukeDamage(structure.pos, this.nukes) > 0) {
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
            if (rampart && rampart.hits < this.incomingNukeDamage(rampart.pos, this.nukes)
                && !_.includes(this.claimedRamparts, rampart)) {
                this.claimedRamparts.push(rampart);
                return rampart;
            } else {
                delete hazmat.memory.rampartId;
                return this.getRampartForHazmat(hazmat);
            }
        } else {
            let ramparts = _.difference(this.nukeRamparts, this.claimedRamparts);
            if (ramparts.length === 0) { return; }
            hazmat.memory.rampartId = ramparts[0].id;
            this.claimedRamparts.push(ramparts[0]);
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
            notifier.log(`MASON: destroying extension to make room for hazmat`);
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
        if (this.memory.nukeData.hazmatPositions[serializedPos]) { return false; }
        return true;
    }
}
