import {Operation, OperationMemory} from "./Operation";
import {EmergencyMinerMission} from "../missions/EmergencyMission";
import {RefillMission} from "../missions/RefillMission";
import {PowerMission} from "../missions/PowerMission";
import {TerminalNetworkMission} from "../missions/TerminalNetworkMission";
import {IgorMission} from "../missions/IgorMission";
import {LinkMiningMission} from "../missions/LinkMiningMission";
import {MiningMission} from "../missions/MiningMission";
import {BuilderMission} from "../missions/BuilderMission";
import {LinkNetworkMission} from "../missions/LinkNetworkMission";
import {GeologyMission} from "../missions/GeologyMission";
import {UpgradeMission} from "../missions/UpgradeMission";
import {Coord, SeedData} from "../../interfaces";
import {helper} from "../../helpers/helper";
import {SeedAnalysis} from "../SeedAnalysis";
import {SpawnGroup} from "../SpawnGroup";
import {Empire, empire} from "../Empire";
import {MasonMission} from "../missions/MasonMission";
import {OperationPriority} from "../../config/constants";
import {BodyguardMission} from "../missions/BodyguardMission";
import {RemoteBuildMission} from "../missions/RemoteBuildMission";
import {ScoutMission} from "../missions/ScoutMission";
import {ClaimMission} from "../missions/ClaimMission";
import {SurveyMission} from "../missions/SurveyMission";
import {DefenseMission} from "../missions/DefenseMission";
import {DefenseGuru} from "../DefenseGuru";
import {Scheduler} from "../../Scheduler";
import {PaverMission} from "../missions/PaverMission";
import {Viz} from "../../helpers/Viz";
import {FlexMap, Layout, LAYOUT_SEGMENTID, LayoutData, LayoutType, Vector2} from "../layouts/Layout";
import {LayoutBuilder} from "../layouts/LayoutBuilder";
import {LayoutDisplay} from "../layouts/LayoutDisplay";
import {LayoutFactory} from "../layouts/LayoutFactory";
import {MemHelper} from "../../helpers/MemHelper";
import {BaseRepairMission} from "../missions/BaseRepairMission";
import {Profiler} from "../../Profiler";

interface ControllerOperationMemory extends OperationMemory {
    radius: number;
    rotation: number;
    centerPosition: RoomPosition;
    repairIndices: {[structureType: string]: number};
}

export class ControllerOperation extends Operation {

    public layout: Layout;
    private defenseGuru: DefenseGuru;
    private builder: LayoutBuilder;

    public memory: ControllerOperationMemory;

    constructor(flag: Flag, name: string, type: string) {
        super(flag, name, type);
        this.priority = OperationPriority.OwnedRoom;
        if (flag.room && flag.room.controller.level < 6) {
            this.priority = OperationPriority.VeryHigh;
        }
    }

    public init() {

        this.initRemoteSpawn(8, 8);
        this.defenseGuru = new DefenseGuru(this);
        this.defenseGuru.init();
        this.layout = LayoutFactory.Instantiate(this.roomName);
        this.layout.init();
        this.builder = new LayoutBuilder(this.layout, this.roomName);
        this.builder.init();
        this.spawnGroup = empire.spawnGroups[this.flag.pos.roomName];

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
                && this.remoteSpawn.spawnGroup.room.controller.level === 8) {
                let bodyguard = new BodyguardMission(this);
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
        this.addMission(new PowerMission(this));

        // energy network
        if (this.flag.room.terminal && this.flag.room.storage && this.flag.room.controller.level >= 6) {
            this.addMission(new TerminalNetworkMission(this));
            this.addMission(new IgorMission(this));
        }

        // harvest energy
        MiningMission.Add(this, true);

        // update construction
        let buildMission = new BuilderMission(this, this.defenseGuru);
        this.addMission(buildMission);

        // upgrader controller
        this.addMission(new UpgradeMission(this));

        if (this.flag.room.storage) {
            // use link array near storage to fire energy at controller link (pre-rcl8)
            this.addMission(new LinkNetworkMission(this));
            // mine minerals
            this.addMission(new GeologyMission(this));
            // scout and place harvest flags
            // this.addMission(new SurveyMission(this));
            // repair walls
            this.addMission(new MasonMission(this, this.defenseGuru));
        }

        this.addMission(new BaseRepairMission(this));

        // this.addMission(new PaverMission(this, defenseGuru.hostiles.length > 0));
    }

    public update() {
        this.spawnGroup = empire.spawnGroups[this.flag.pos.roomName];
        this.initRemoteSpawn(8, 8);
        if (!this.spawnGroup && this.remoteSpawn) {
            this.spawnGroup = this.remoteSpawn.spawnGroup;
        }

        this.defenseGuru.update();
        this.layout.update();
        this.builder.update();
    }

    public finalize() {
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

        if (this.layout) { this.layout.wipeFlex(); }
        console.log("attemping to move layout, globals will need to be refreshed before a change is made");
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

    public showLayout(type = "all", maintain = true): string {
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
