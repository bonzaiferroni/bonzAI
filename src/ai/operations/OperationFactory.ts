import {MiningOperation} from "./MiningOperation";
import {KeeperOperation} from "./KeeperOperation";
import {ControllerOperation} from "./ControllerOperation";
import {EvacOperation} from "./EvacOperation";
import {LayoutOperation} from "./LayoutOperation";
import {Operation, OperationPriorityMap} from "./Operation";
import {DemolishOperation} from "./DemolishOperation";
import {SandboxOperation} from "./SandboxOperation";
import {PosHelper} from "../../helpers/PosHelper";
import {SwarmOperation} from "./BootstrapOperation";
import {core} from "../Empire";
import {helper} from "../../helpers/helper";
import {BountyOperation} from "./BountyOperation";
import {PeaceOperation} from "./PeaceOperation";
import {RaidOperation} from "../../private/RaidOperation/RaidOperation";
import {IntelOperation} from "../../private/RaidOperation/IntelOperation";
import {StumpOperation} from "./HealStumpOperation";

export class OperationFactory {

    private static map: OperationPriorityMap = {};
    private static flagCount: number;
    private static classes = {
        // conquest: ConquestOperation,
        // fort: FortOperation,
        // tran: TransportOperation,
        // zombie: ZombieOperation,
        // guard: GuardOperation,
        // swap: SwapOperation,
        // rupg: RemoteUpgradeOperation,
        // siege: SiegeOperation,
        // sabo: SabotageOperation,
        raid: RaidOperation,
        demolish: DemolishOperation,
        mining: MiningOperation,
        keeper: KeeperOperation,
        control: ControllerOperation,
        evac: EvacOperation,
        layout: LayoutOperation,
        sand: SandboxOperation,
        swarm: SwarmOperation,
        intel: IntelOperation,
        bounty: BountyOperation,
        peace: PeaceOperation,
        stump: StumpOperation,
    };

    private static scannedFlags: {[flagName: string]: boolean } = {};
    private static memory: {
        opNames: {[opName: string]: number }
    };

    /**
     * scan for operations flags and instantiate
     */

    public static init() {
        if (!Memory.opFactory) {
            Memory.opFactory = {};
        }

        this.memory = Memory.opFactory;
        if (!this.memory.opNames) { this.memory.opNames = {}; }
    }

    public static getOperations(): OperationPriorityMap {
        this.scanFlags();
        return this.map;
    }

    public static scanFlags() {
        for (let flagName in Game.flags) {
            if (this.scannedFlags[flagName]) { continue; }
            this.scannedFlags[flagName] = true;
            if (this.memory.opNames[flagName]) {
                this.memory.opNames[flagName] = Game.time;
                continue;
            }

            let type = this.getType(flagName);
            if (!this.classes[type]) { continue; }

            this.memory.opNames[flagName] = Game.time;
        }

        for (let flagName in this.memory.opNames) {
            let nextInit = this.memory.opNames[flagName];
            if (nextInit > Game.time) { continue; }
            this.memory.opNames[flagName] = Game.time + helper.randomInterval(2000);

            let flag = Game.flags[flagName];
            if (flag) {
                let operation = this.getOperation(flag);
                this.addToMap(operation);
                operation.baseInit();
            } else {
                delete this.memory.opNames[flagName];
            }
        }
    }

    private static getType(flagName: string): string {
        return flagName.substring(0, flagName.indexOf("_"));
    }

    private static getName(flagName: string): string {
        return flagName.substring(flagName.indexOf("_") + 1);
    }

    private static getOperation(flag: Flag): Operation {
        let name = this.getName(flag.name);
        let type = this.getType(flag.name);
        let opClass = this.classes[type];
        return new opClass(flag, name, type);
    }

    private static addToMap(operation: Operation) {
        let priority = operation.priority;
        if (!this.map[priority]) { this.map[priority] = {}; }

        global[operation.name] = operation;
        this.map[priority][operation.name] = operation;
    }

    public static bootstrapOperations() {
        if (Memory.playerConfig.manual) { return; }
        if (Object.keys(Game.flags).length > 0) {
            return;
        }

        let spawn1 = _.toArray(Game.spawns)[0];
        if (!spawn1) {
            console.log("bonzAI: place your first spawn somewhere nice");
            return;
        }

        let pos = PosHelper.pathablePosition(spawn1.pos.roomName);
        core.addOperation("layout", pos);
        core.addOperation("swarm", pos);
        core.addOperation("intel", pos, "nsa");
    }
}
