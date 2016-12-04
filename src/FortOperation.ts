import {Operation} from "./Operation";
import {Empire} from "./Empire";

import {BuildMission} from "./BuildMission";
import {EmergencyMinerMission} from "./EmergencyMission";
import {GeologyMission} from "./GeologyMission";
import {IgorMission} from "./IgorMission";
import {LinkMiningMission} from "./LinkMiningMission";
import {LinkNetworkMission} from "./LinkNetworkMission";
import {DefenseMission} from "./DefenseMission";
import {MiningMission} from "./MiningMission";
import {PaverMission} from "./PaverMission";
import {PowerMission} from "./PowerMission";
import {RefillMission} from "./RefillMission";
import {TerminalNetworkMission} from "./TerminalNetworkMission";
import {UpgradeMission} from "./UpgradeMission";

import {OperationPriority, NEED_ENERGY_THRESHOLD, ENERGYSINK_THRESHOLD} from "./constants";

export class FortOperation extends Operation {

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
            this.addMission(new RefillMission(this));

            this.addMission(new DefenseMission(this));

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
                        this.addMission(new LinkMiningMission(this, "linkMiner" + i, source, link));
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
}