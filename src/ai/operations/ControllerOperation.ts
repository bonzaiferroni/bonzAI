import {Operation, OperationMemory} from "./Operation";
import {Layout} from "../layouts/Layout";
import {DefenseGuru} from "../DefenseGuru";
import {LayoutBuilder} from "../layouts/LayoutBuilder";
import {OperationPriority} from "../../config/constants";
import {LayoutFactory} from "../layouts/LayoutFactory";
import {empire} from "../Empire";
import {ScoutMission} from "../missions/ScoutMission";
import {RemoteBuildMission} from "../missions/RemoteBuildMission";
import {ClaimMission} from "../missions/ClaimMission";
import {BodyguardMission} from "../missions/BodyguardMission";
import {EmergencyMinerMission} from "../missions/EmergencyMission";
import {DefenseMission} from "../missions/DefenseMission";
import {PowerMission} from "../missions/PowerMission";
import {TerminalNetworkMission} from "../missions/TerminalNetworkMission";
import {RefillMission} from "../missions/RefillMission";
import {IgorMission} from "../missions/IgorMission";
import {BuilderMission} from "../missions/BuilderMission";
import {UpgradeMission} from "../missions/UpgradeMission";
import {LinkNetworkMission} from "../missions/LinkNetworkMission";
import {GeologyMission} from "../missions/GeologyMission";
import {MasonMission} from "../missions/MasonMission";
import {SurveyMission} from "../missions/SurveyMission";
import {BaseRepairMission} from "../missions/BaseRepairMission";
import {PaverMission} from "../missions/PaverMission";
import {Viz} from "../../helpers/Viz";
import {Scheduler} from "../../Scheduler";
import {EarlyBodyguardMission} from "../missions/EarlyBodyguardMission";
import {Notifier} from "../../notifier";

interface ControllerOperationMemory extends OperationMemory {
    founded: number;
    radius: number;
    rotation: number;
    centerPosition: RoomPosition;
    repairIndices: {[structureType: string]: number};
    showLayoutType: string;
    showLayoutTill: number;
    checkPlant: number;
}

export class ControllerOperation extends Operation {

    public layout: Layout;
    private defenseGuru: DefenseGuru;
    private builder: LayoutBuilder;

    public memory: ControllerOperationMemory;

    constructor(flag: Flag, name: string, type: string) {
        super(flag, name, type);
        this.priority = OperationPriority.OwnedRoom;
    }

    public init() {

        if (!this.memory.founded) { this.memory.founded = Game.time; }

        this.updateRemoteSpawn(8, 800);
        this.defenseGuru = new DefenseGuru(this);
        this.defenseGuru.init();
        this.layout = LayoutFactory.Instantiate(this.roomName);
        this.layout.init();
        this.builder = new LayoutBuilder(this.layout, this.roomName);
        this.builder.init();
        this.spawnGroup = empire.getSpawnGroup(this.roomName);

        let remoteSpawning = false;
        if (!this.spawnGroup) {
            remoteSpawning = true;

            if (!this.remoteSpawn) {
                console.log(`${this.name} is unable to spawn, no local or remote spawnGroup`);
                return;
            }

            this.spawnGroup = this.remoteSpawn.spawnGroup;
            this.addMission(new ScoutMission(this));
            this.addMission(new ClaimMission(this));
            if (!this.state.hasVision || this.room.controller.level === 0) { return; }
        }

        this.addMission(new RemoteBuildMission(this, false, remoteSpawning));

        if (this.room.controller.level < 3 && this.room.findStructures(STRUCTURE_TOWER).length === 0) {
            if (this.remoteSpawn && this.remoteSpawn.spawnGroup
                && this.remoteSpawn.spawnGroup.room.controller.level >= 4) {
                let bodyguard = new EarlyBodyguardMission(this);
                bodyguard.spawnGroup = this.remoteSpawn.spawnGroup;
                this.addMission(bodyguard);
            }
        }

        if (this.flag.room.findStructures(STRUCTURE_SPAWN).length > 0) {
            // spawn emergency miner if needed
            this.addMission(new EmergencyMinerMission(this));
            // refill spawning energy - will spawn small spawnCart if needed
            this.addMission(new RefillMission(this));
        }

        this.addMission(new DefenseMission(this));
        if (Memory.playerConfig.manual) {
            this.addMission(new PowerMission(this));
        }

        // energy network
        if (this.flag.room.terminal && this.flag.room.storage && this.flag.room.controller.level >= 6) {
            this.addMission(new TerminalNetworkMission(this));
            this.addMission(new IgorMission(this));
        }

        // harvest energy
        Operation.addMining(this, true, true);

        // update construction
        let buildMission = new BuilderMission(this);
        this.addMission(buildMission);

        // upgrader controller
        this.addMission(new UpgradeMission(this));

        if (this.flag.room.storage) {
            // use link array near storage to fire energy at controller link (pre-rcl8)
            this.addMission(new LinkNetworkMission(this));
            // mine minerals
            this.addMission(new GeologyMission(this));
            // repair walls
            this.addMission(new MasonMission(this, this.defenseGuru));
        }

        if (!Memory.playerConfig.manual) {
            this.addMission(new SurveyMission(this));
        }

        this.addMission(new BaseRepairMission(this));
        this.addMission(new PaverMission(this));
    }

    public update() {
        this.spawnGroup = empire.spawnGroups[this.flag.pos.roomName];
        this.updateRemoteSpawn(8, 800);
        if (!this.spawnGroup && this.remoteSpawn) {
            this.spawnGroup = this.remoteSpawn.spawnGroup;
        }

        this.defenseGuru.update();
        this.layout.update();
        this.builder.update();
    }

    public finalize() {
        if ((!this.room || !this.room.controller.my) && Game.time > this.memory.founded + 5000) {
            Notifier.log(`OPERATION was unable to get started in ${this.roomName}`);
            this.flag.remove();
        }

        if (Game.time < this.memory.showLayoutTill) {
            this.showLayout(this.memory.showLayoutType, 0);
        }
    }

    public invalidateCache() {
    }

    public setLayout(x: number, y: number, rotation: number, type: string) {
        Memory.rooms[this.flag.pos.roomName].layout = {
            anchor: {x: x, y: y},
            rotation: rotation,
            type: type,
            flex: false,
        };

        this.layout = LayoutFactory.Instantiate(this.roomName);
        this.layout.init();

        console.log("attemping to move layout:", JSON.stringify(Memory.rooms[this.flag.pos.roomName].layout));
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

    public showLayout(type = "all", maintain = 20): string {

        if (maintain !== 0) {
            this.memory.showLayoutTill = Game.time + maintain;
            this.memory.showLayoutType = type;
        }

        if (!this.layout || !this.layout.map) {
            return "No layout defined";
        }

        for (let structureType of Object.keys(CONSTRUCTION_COST)) {
            if (type === "all" || type === structureType ) {
                let positions = this.layout.map[structureType];
                for (let position of positions) {
                    let color = "white";
                    if (structureType === STRUCTURE_EXTENSION || structureType === STRUCTURE_SPAWN
                        || structureType === STRUCTURE_STORAGE || structureType === STRUCTURE_NUKER) {
                        color = "yellow";
                    } else if (structureType === STRUCTURE_TOWER) {
                        color = "blue";
                    } else if (structureType === STRUCTURE_LAB || structureType === STRUCTURE_TERMINAL) {
                        color = "aqua";
                    } else if (structureType === STRUCTURE_POWER_SPAWN) {
                        color = "red";
                    } else if (structureType === STRUCTURE_OBSERVER) {
                        color = "aqua";
                    } else if (structureType === STRUCTURE_ROAD) {
                        color = "grey";
                    } else if (structureType === STRUCTURE_RAMPART) {
                        color = "green";
                    }
                    Viz.colorPos(position, color, .5);
                }
            }
        }

        return `showing layout for: ${type}`;
    }
}
