import {Operation} from "./Operation";
import {EmergencyMinerMission} from "../missions/EmergencyMission";
import {RefillMission} from "../missions/RefillMission";
import {DefenseMission} from "../missions/DefenseMission";
import {PowerMission} from "../missions/PowerMission";
import {TerminalNetworkMission} from "../missions/TerminalNetworkMission";
import {IgorMission} from "../missions/IgorMission";
import {LinkMiningMission} from "../missions/LinkMiningMission";
import {MiningMission} from "../missions/MiningMission";
import {BuilderMission} from "../missions/BuilderMission";
import {LinkNetworkMission} from "../missions/LinkNetworkMission";
import {UpgradeMission} from "../missions/UpgradeMission";
import {GeologyMission} from "../missions/GeologyMission";
import {PaverMission} from "../missions/PaverMission";
import {DefenseGuru} from "../DefenseGuru";
import {OperationPriority} from "../../config/constants";
import {NEED_ENERGY_THRESHOLD, ENERGYSINK_THRESHOLD} from "../TradeNetwork";
import {empire} from "../Empire";

export class FortOperation extends Operation {

    public memory: any;

    /**
     * Manages the activities of an owned missionRoom, assumes bonzaiferroni's update spec
     * @param flag
     * @param name
     * @param type
     */

    constructor(flag: Flag, name: string, type: string) {
        super(flag, name, type);
        this.priority = OperationPriority.OwnedRoom;
    }

    public init() {
        if (this.flag.room) {
            // init FortOperation variables
            this.spawnGroup = empire.getSpawnGroup(this.flag.room.name);

            // spawn emergency miner if needed
            this.addMission(new EmergencyMinerMission(this));

            // refill spawning energy - will spawn small spawnCart if needed
            let structures = this.flag.room.findStructures(STRUCTURE_EXTENSION)
                .concat(this.flag.room.find<StructureSpawn>(FIND_MY_SPAWNS)) as Structure[];
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
            MiningMission.Add(this, true);

            // update construction
            let defenseGuru = new DefenseGuru(this);
            this.addMission(new BuilderMission(this, defenseGuru));

            // update walls
            // TODO: make MasonMission

            // use link array near storage to fire energy at controller link (pre-rcl8)
            if (this.flag.room.storage) {
                this.addMission(new LinkNetworkMission(this));

                let extractor = this.state.mineral.pos.lookFor<StructureExtractor>(LOOK_STRUCTURES)[0];
                if (this.flag.room.energyCapacityAvailable > 5000 && extractor && extractor.my) {
                    this.addMission(new GeologyMission(this));
                }
            }

            // upgrader controller
            this.addMission(new UpgradeMission(this));

            // pave all roads in the missionRoom
            this.addMission(new PaverMission(this, true));
        }
    }

    public update() { }

    public finalize() {
    }
    public invalidateCache() {
        this.memory.masonPotency = undefined;
        this.memory.builderPotency = undefined;
    }

    public calcMasonPotency(): number {
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

    public calcBuilderPotency(): number {
        if (!this.memory.builderPotency) {
            this.memory.builderPotency = Math.min(Math.floor(this.spawnGroup.maxSpawnEnergy / 175), 20);
        }
        return this.memory.builderPotency;
    }

    public nuke(x: number, y: number, roomName: string): string {
        let nuker = _.head(this.flag.room.find(FIND_MY_STRUCTURES,
            {filter: {structureType: STRUCTURE_NUKER}})) as StructureNuker;
        let outcome = nuker.launchNuke(new RoomPosition(x, y, roomName));
        if (outcome === OK) {
            empire.map.addNuke({tick: Game.time, roomName: roomName});
            return "NUKER: Bombs away! \\o/";
        } else {
            return `NUKER: error: ${outcome}`;
        }
    }
}
