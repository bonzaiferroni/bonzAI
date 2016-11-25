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
import {Coord} from "./interfaces";

const QUAD_RADIUS = 6;
const REPAIR_INTERVAL = 4;

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
        rotation: number
        repairIndex: number
        temporaryPlacement: {[level: number]: boolean}
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
            this.repairWall();
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
            {x: -2, y: -3}, {x: -2, y: -4}, {x: 4, y: 0}, {x: -4, y: 0}, {x: -3, y: 1},
            {x: -1, y: 1}, {x: 3, y: 1}, {x: 4, y: -2}, {x: 3, y: -3}, {x: 2, y: -4},
            {x: -3, y: -3}, {x: -4, y: -2}, {x: 5, y: -3}, {x: 4, y: -4}, {x: 3, y: -5},
            {x: -3, y: -5}, {x: -4, y: -4}, {x: -5, y: -3}, {x: 3, y: 2}, {x: 3, y: 3},
            {x: 4, y: 2}, {x: 3, y: 5}, {x: 4, y: 4}, {x: 5, y: 3}, {x: 5, y: 1},
            {x: 5, y: 0}, {x: 5, y: -1}, {x: 5, y: -4}, {x: 5, y: -5}, {x: 4, y: -5},
            {x: 1, y: -5}, {x: 0, y: -5}, {x: -1, y: -5}, {x: -4, y: -5}, {x: -5, y: -5},
            {x: -5, y: -4}, {x: -5, y: -1}, {x: -5, y: 0}, {x: -5, y: 1}, {x: 4, y: 5},
            {x: 5, y: 4}, {x: 5, y: 5}, {x: -6, y: 2}, {x: -6, y: -2}, {x: -2, y: -6},
            {x: 2, y: 2}, {x: 2, y: -6}, {x: 6, y: -2}, {x: 6, y: 2}, {x: 2, y: 3}, ],
        [STRUCTURE_STORAGE]: [{x: 0, y: 4}],
        [STRUCTURE_TERMINAL]: [{x: 0, y: 2}],
        [STRUCTURE_NUKER]: [{x: 0, y: 6}],
        [STRUCTURE_POWER_SPAWN]: [{x: -2, y: 2}],
        [STRUCTURE_LAB]: [
            {x: -2, y: 4}, {x: -3, y: 3}, {x: -4, y: 2}, {x: -3, y: 4}, {x: -4, y: 4},
            {x: -5, y: 3}, {x: -2, y: 3}, {x: -3, y: 2}, {x: -4, y: 5}, {x: -5, y: 4}]
    };

    private autoLayout() {
        if (this.memory.centerPoint && this.memory.rotation !== undefined) {
            let centerPosition = new RoomPosition(this.memory.centerPoint.x, this.memory.centerPoint.y, this.flag.room.name);
            for (let structureType in this.layoutDeltas) {
                let allowedCount = CONTROLLER_STRUCTURES[structureType][this.flag.room.controller.level];
                let constructionCount = centerPosition.findInRange(FIND_MY_CONSTRUCTION_SITES, QUAD_RADIUS,
                    {filter: (c: ConstructionSite) => c.structureType === structureType}).length;
                let count = _.filter(this.flag.room.findStructures(structureType),
                        (s: Structure) => { return centerPosition.inRangeTo(s, QUAD_RADIUS)}).length + constructionCount;
                if (count < allowedCount) {
                    this.findNextConstruction(structureType, allowedCount - count)
                }
            }

            this.temporaryPlacement(this.flag.room.controller.level);
        }
    }

    private findNextConstruction(structureType: string, amountNeeded: number) {
        let amountOrdered = 0;

        for (let coord of this.layoutDeltas[structureType]) {
            let position = this.coordToPosition(coord);
            if (!position) {
                console.log(`LAYOUT: bad position, is centerPoint misplaced? (${this.name})`);
                return;
            }
            let hasStructure = position.lookForStructure(structureType);
            if (hasStructure) continue;
            let hasConstruction = position.lookFor(LOOK_CONSTRUCTION_SITES)[0];
            if (hasConstruction) continue;

            let outcome = position.createConstructionSite(structureType);
            if (outcome === OK) {
                console.log(`LAYOUT: placing ${structureType} at ${position} (${this.name})`);
                amountOrdered++;
            }
            else {
                console.log(`bad construction placement: ${outcome}, ${structureType} (${this.name})`, coord.x, coord.y);
            }

            if (amountOrdered === amountNeeded) {
                console.log(`LAYOUT: finished placing construction for: ${structureType} (${this.name})`);
                break;
            }
        }
    }

    private coordToPosition(coord: Coord) {
        let centerPoint = this.memory.centerPoint;
        let rotation = this.memory.rotation;

        let xRotation = 1;
        let yRotation = 1;
        if (rotation === 1) {
            yRotation = -1;
        }
        else if (rotation === 2) {
            xRotation = -1;
            yRotation = -1;
        }
        else if (rotation === 3) {
            xRotation = -1;
        }
        return new RoomPosition(centerPoint.x + coord.x * xRotation, centerPoint.y + coord.y * yRotation, this.flag.room.name);
    }

    private repairWall() {
        if (Game.time % REPAIR_INTERVAL !== 0) return;

        let towers = this.flag.room.findStructures(STRUCTURE_TOWER) as StructureTower[];
        let ramparts = this.flag.room.findStructures(STRUCTURE_RAMPART) as StructureRampart[];
        if (towers.length === 0 || ramparts.length === 0) return;

        let rampart = _(ramparts).sortBy("hits").head();

        rampart.pos.findClosestByRange<StructureTower>(towers).repair(rampart);
    }

    private temporaryPlacement(level: number) {
        if (!this.memory.temporaryPlacement) this.memory.temporaryPlacement = {};
        if (!this.memory.temporaryPlacement[level]) {

            let actions: {actionType: string, structureType: string, coord: Coord}[] = [];

            // containers
            if (level === 2) {
                actions.push({actionType: "place", structureType: STRUCTURE_CONTAINER, coord: {x: -1, y: 5}});
            }
            if (level === 5) {
                actions.push({actionType: "remove", structureType: STRUCTURE_CONTAINER, coord: {x: -1, y: 5}});
            }

            // links
            if (level === 5) {
                actions.push({actionType: "place", structureType: STRUCTURE_LINK, coord: {x: 2, y: 2}});
            }
            if (level === 6) {
                actions.push({actionType: "place", structureType: STRUCTURE_LINK, coord: {x: 2, y: 3}});
            }
            if (level === 7) {
                actions.push({actionType: "place", structureType: STRUCTURE_LINK, coord: {x: 2, y: 4}});
            }
            if (level === 8) {
                actions.push({actionType: "remove", structureType: STRUCTURE_LINK, coord: {x: 2, y: 3}});
                actions.push({actionType: "remove", structureType: STRUCTURE_LINK, coord: {x: 2, y: 4}});
            }

            for (let action of actions) {
                let outcome;
                let position = this.coordToPosition(action.coord);
                if (action.actionType === "place") {
                    outcome = position.createConstructionSite(action.structureType);
                }
                else {
                    let structure = position.lookForStructure(action.structureType);
                    if (structure) {
                        outcome = structure.destroy();
                    }
                    else {
                        outcome = "noStructure";
                    }
                }

                if (outcome === OK) {
                    console.log(`LAYOUT: ${action}d temporary ${action.structureType} (${this.name}, level: ${level})`)
                }
                else {
                    console.log(`LAYOUT: problem with temp placement, please follow up in ${this.name}`);
                    console.log(`tried to ${action} ${action.structureType} at level ${level}, outcome: ${outcome}`);
                }
            }

            this.memory.temporaryPlacement[level] = true;
        }
    }
}