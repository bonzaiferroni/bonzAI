import {Operation} from "./Operation";
import {Empire} from "./Empire";
import {BuildMission} from "./BuildMission";
import {EmergencyMinerMission} from "./EmergencyMission";
import {GeologyMission} from "./GeologyMission";
import {IgorMission} from "./IgorMission";
import {LinkMiningMission} from "./LinkMiningMission";
import {LinkNetworkMission} from "./LinkNetworkMission";
import {NightsWatchMission} from "./NightsWatchMission";
import {MiningMission} from "./MiningMission";
import {PaverMission} from "./PaverMission";
import {PowerMission} from "./PowerMission";
import {RefillMission} from "./RefillMission";
import {TerminalNetworkMission} from "./TerminalNetworkMission";
import {UpgradeMission} from "./UpgradeMission";

import {OperationPriority, NEED_ENERGY_THRESHOLD, ENERGYSINK_THRESHOLD} from "./constants";
import {helper} from "./helper";

export class QuadOperation extends Operation {

    memory: {
        powerMining: boolean
        noMason: boolean
        masonPotency: number
        builderPotency: number
        wallBoost: boolean
        mason: { activateBoost: boolean }
        network: { scanData: { roomNames: string[]} }
        centerPoint: {x: number, y: number }
    };

    /**
     * Manages the activities of an owned room, assumes bonzaiferroni's build spec
     * @param flag
     * @param name
     * @param type
     * @param empire
     */

    constructor(flag: Flag, name: string, type: string, empire: Empire) {
        super(flag, name, type, empire);
        this.priority = OperationPriority.OwnedRoom;
    }

    initOperation() {
        if (this.flag.room) {

            // initOperation FortOperation variables
            this.spawnGroup = this.empire.getSpawnGroup(this.flag.room.name);
            this.empire.register(this.flag.room);

            // spawn emergency miner if needed
            this.addMission(new EmergencyMinerMission(this));

            // refill spawning energy - will spawn small spawnCart if needed
            let structures = this.flag.room.findStructures(STRUCTURE_EXTENSION)
                .concat(this.flag.room.find(FIND_MY_SPAWNS)) as Structure[];
            let maxCarts = this.flag.room.storage ? 1 : 2;
            this.addMission(new RefillMission(this, "spawnCart", maxCarts, structures, 10, true));

            this.addMission(new NightsWatchMission(this));

            if (this.memory.powerMining) {
                this.addMission(new PowerMission(this));
            }

            // energy network
            if (this.flag.room.terminal && this.flag.room.storage) {
                this.addMission(new TerminalNetworkMission(this));
                this.addMission(new IgorMission(this));
            }

            // harvest energy
            for (let i = 0; i < this.sources.length; i++) {
                if (this.sources[i].pos.lookFor(LOOK_FLAGS).length > 0) continue;
                let source = this.sources[i];
                if (this.flag.room.controller.level === 8 && this.flag.room.storage) {
                    let link = source.findMemoStructure(STRUCTURE_LINK, 2) as StructureLink;
                    if (link) {
                        this.addMission(new LinkMiningMission(this, "miner" + i, source, link));
                        continue;
                    }
                }
                this.addMission(new MiningMission(this, "miner" + i, source));
            }

            // build construction
            let allowBuilderSpawn = this.flag.room.find(FIND_MY_CONSTRUCTION_SITES).length > 0;
            this.addMission(new BuildMission(this, "builder", this.calcBuilderPotency(), allowBuilderSpawn));

            // build walls
            if (this.flag.room.findStructures(STRUCTURE_RAMPART).length > 0 && !this.memory.noMason) {
                this.addMission(new BuildMission(this, "mason", this.calcMasonPotency()));
            }

            // use link array near storage to fire energy at controller link (pre-rcl8)
            if (this.flag.room.storage) {
                this.addMission(new LinkNetworkMission(this));

                let extractor = this.mineral.pos.lookFor<StructureExtractor>(LOOK_STRUCTURES)[0];
                if (this.flag.room.energyCapacityAvailable > 5000 && extractor && extractor.my) {
                    this.addMission(new GeologyMission(this));
                }
            }

            // upgrader controller
            let boostUpgraders = this.flag.room.controller.level < 8;
            this.addMission(new UpgradeMission(this, boostUpgraders));

            // repair roads
            this.addMission(new PaverMission(this));


            this.autoLayout();
        }
    }

    finalizeOperation() {
    }
    invalidateOperationCache() {
        this.memory.masonPotency = undefined;
        this.memory.builderPotency = undefined;
    }

    calcMasonPotency(): number {
        if (!this.memory.masonPotency) {
            let surplusMode = this.flag.room.storage && this.flag.room.storage.store.energy > NEED_ENERGY_THRESHOLD;
            let megaSurplusMode = this.flag.room.storage && this.flag.room.storage.store.energy > ENERGYSINK_THRESHOLD;
            let potencyBasedOnStorage = megaSurplusMode ? 10 : surplusMode ? 5 : 1;

            if (this.memory.wallBoost) {
                potencyBasedOnStorage = 20;
            }

            // would happen to be the same as the potency used for builders
            let potencyBasedOnSpawn = this.calcBuilderPotency();

            if (this.memory.wallBoost) {
                this.memory.mason.activateBoost = true;
            }

            this.memory.masonPotency = Math.min(potencyBasedOnSpawn, potencyBasedOnStorage);
        }
        return this.memory.masonPotency;
    }

    calcBuilderPotency(): number {
        if (!this.memory.builderPotency) {
            this.memory.builderPotency = Math.min(Math.floor(this.spawnGroup.maxSpawnEnergy / 175), 20);
        }
        return this.memory.builderPotency;
    }

    public nuke(x: number, y: number, roomName: string): string {
        let nuker = _.head(this.flag.room.find(FIND_MY_STRUCTURES, {filter: {structureType: STRUCTURE_NUKER}})) as StructureNuker;
        let outcome = nuker.launchNuke(new RoomPosition(x, y, roomName));
        if (outcome === OK) {
            this.empire.addNuke({tick: Game.time, roomName: roomName});
            return "NUKER: Bombs away! \\o/";
        }
        else {
            return `NUKER: error: ${outcome}`;
        }
    }

    addAllyRoom(roomName: string) {
        if (_.includes(this.memory.network.scanData.roomNames, roomName)) {
            return "NETWORK: " + roomName + " is already being scanned by " + this.name;
        }

        this.memory.network.scanData.roomNames.push(roomName);
        this.empire.addAllyForts([roomName]);
        return "NETWORK: added " + roomName + " to rooms scanned by " + this.name;
    }

    layoutDeltas = {
        [STRUCTURE_SPAWN]: [{x: 2, y: 0}, {x: 0, y: -2}, {x: -2, y: 0}],
        [STRUCTURE_TOWER]: [
            {x: 1, y: -1}, {x: -1, y: -1}, {x: 0, y: -1}, {x: 1, y: 0}, {x: 0, y: 1}, {x: -1, y: 0}],
        [STRUCTURE_EXTENSION]: [
            {x: 3, y: -1}, {x: 2, y: -2}, {x: 1, y: -3}, {x: 3, y: -2}, {x: 2, y: -3},
            {x: 0, y: -4}, {x: -1, y: -3}, {x: -2, y: -2}, {x: -3, y: -1}, {x: -3, y: -2},
            {x: -2, y: -3}, {x: 0, y: -4}, {x: 4, y: 0}, {x: -4, y: 0}, {x: -3, y: 1},
            {x: -1, y: 1}, {x: 2, y: 2}, {x: 3, y: 1}, {x: 4, y: -2}, {x: 3, y: -3},
            {x: 2, y: -4}, {x: -3, y: -3}, {x: -4, y: -2}, {x: 5, y: -3}, {x: 4, y: -4},
            {x: 3, y: -5}, {x: -3, y: -5}, {x: -4, y: -4}, {x: -5, y: -3}, {x: 3, y: 2},
            {x: 3, y: 3}, {x: 4, y: 2}, {x: 3, y: 5}, {x: 4, y: 4}, {x: 5, y: 3},
            {x: 5, y: 1}, {x: 5, y: 0}, {x: 5, y: -1}, {x: 5, y: -4}, {x: 5, y: -5},
            {x: 4, y: -5}, {x: 1, y: -5}, {x: 0, y: -5}, {x: -1, y: -5}, {x: -4, y: -5},
            {x: -5, y: -5}, {x: -5, y: -4}, {x: -5, y: -1}, {x: -5, y: 0}, {x: -5, y: 1},
            {x: 4, y: 5}, {x: 5, y: 4}, {x: -6, y: 2}, {x: -6, y: -2}, {x: -2, y: -6},
            {x: 2, y: -6}, {x: 6, y: -2}, {x: 6, y: 2}, {x: 2, y: 3}, {x: 3, y: -1}, ],
        [STRUCTURE_STORAGE]: [{x: 0, y: 4}],
        [STRUCTURE_TERMINAL]: [{x: 0, y: 2}],
        [STRUCTURE_NUKER]: [{x: 0, y: 6}],
        [STRUCTURE_POWER_SPAWN]: [{x: 2, y: 2}],
        [STRUCTURE_LAB]: [
            {x: -2, y: 4}, {x: -3, y: 3}, {x: -4, y: 2}, {x: -3, y: 4}, {x: -4, y: 4},
            {x: -5, y: 3}, {x: -2, y: 3}, {x: -3, y: 2}, {x: -4, y: 5}, {x: -5, y: 4}]
    };

    private autoLayout() {
        if (this.memory.centerPoint) {
            for (let structureType in this.layoutDeltas) {
                let allowedCount = CONTROLLER_STRUCTURES[structureType][this.flag.room.controller.level];
                let constructionCount = this.flag.room.find(FIND_MY_CONSTRUCTION_SITES,
                    {filter: (c: ConstructionSite) => c.structureType === structureType}).length;
                let count = this.flag.room.findStructures(structureType).length + constructionCount;
                if (count < allowedCount) {
                    this.findNextConstruction(structureType, this.memory.centerPoint, allowedCount - count)
                }
            }
        }
    }

    private findNextConstruction(structureType: string, centerPoint: {x: number, y: number}, amountNeeded: number) {
        let amountOrdered = 0;

        for (let coord of this.layoutDeltas[structureType]) {
            let position = this.coordToPosition(coord, centerPoint);
            if (!position) {
                console.log("step 1: didn't find that pos");
                return;
            }
            let hasStructure = position.lookForStructure(structureType) !== null;
            if (hasStructure) continue;
            let hasConstruction = position.lookFor(LOOK_CONSTRUCTION_SITES);
            if (hasConstruction) continue;

            let outcome = position.createConstructionSite(structureType);
            if (outcome === OK) {
                amountOrdered++;
            }
            else {
                console.log(`bad construction placement: ${outcome}`);
            }

            if (amountOrdered === amountNeeded) {
                console.log("finished placing construction for: " + structureType);
            }
        }
    }

    private coordToPosition(coord: {x: number; y: number}, centerPoint: {x: number; y: number}) {
        console.log(coord, centerPoint);
        return new RoomPosition(coord.x - centerPoint.x, coord.y - centerPoint.y, this.flag.room.name);
    }
}