import {MiningOperation} from "./MiningOperation";
import {KeeperOperation} from "./KeeperOperation";
import {ControllerOperation} from "./ControllerOperation";
import {EvacOperation} from "./EvacOperation";
import {LayoutOperation} from "./LayoutOperation";
import {GuardOperation} from "./GuardOperation";
import {SwapOperation} from "./SwapOperation";
import {Operation, OperationMap, OperationPriorityMap} from "./Operation";
import {empire} from "../Empire";
import {TransportOperation} from "./TransportOperation";
import {ZombieOperation} from "./ZombieOperation";
import {DemolishOperation} from "./DemolishOperation";
import {RemoteUpgradeOperation} from "./RemoteUpgradeOperation";
import {submodules} from "../../submodules";

export class OperationFactory {

    private static map: OperationPriorityMap = {};
    private static flagCount: number;
    private static classes = {
        // conquest: ConquestOperation,
        // fort: FortOperation,
        tran: TransportOperation,
        zombie: ZombieOperation,
        demolish: DemolishOperation,
        mining: MiningOperation,
        keeper: KeeperOperation,
        control: ControllerOperation,
        evac: EvacOperation,
        layout: LayoutOperation,
        guard: GuardOperation,
        swap: SwapOperation,
        rupg: RemoteUpgradeOperation,
    };

    private static scannedFlags: {[flagName: string]: boolean } = {};

    /**
     * scan for operations flags and instantiate
     */

    public static getOperations(): OperationPriorityMap {

        this.addSubmodules();

        // gather flag data, instantiate operations
        for (let flagName in Game.flags) {
            this.scannedFlags[flagName] = true;
            let flag = Game.flags[flagName];
            let operation = this.checkFlag(flag);
            if (!operation) { continue; }
            this.addToMap(operation);
        }

        this.flagCount = Object.keys(Game.flags).length;
        return this.map;
    }

    public static flagCheck() {
        let flagCountThisTick = Object.keys(Game.flags).length;
        if (flagCountThisTick !== this.flagCount) {
            this.flagCount = flagCountThisTick;
            for (let flagName in Game.flags) {
                if (this.scannedFlags[flagName]) { continue; }
                this.scannedFlags[flagName] = true;
                let flag = Game.flags[flagName];
                let operation = this.checkFlag(flag);
                if (!operation) { continue; }
                this.addToMap(operation);
                operation.baseInit();
            }
        }
    }

    private static checkFlag(flag: Flag) {
        for (let typeName in this.classes) {
            if (flag.name.substring(0, typeName.length) !== typeName) { continue; }
            let operationClass = this.classes[typeName];
            let name = flag.name.substring(flag.name.indexOf("_") + 1);

            let operation = new operationClass(flag, name, typeName) as Operation;
            return operation;
        }
    }

    private static addToMap(operation: Operation) {
        let priority = operation.priority;
        if (!this.map[priority]) { this.map[priority] = {}; }

        if (global.hasOwnProperty(operation.name) && this.map[priority][operation.name]) {
            console.log(`operation with name ${operation.name} already exists (type: ${
                this.map[priority][operation.name].type}), please use a different name`);
        }

        global[operation.name] = operation;
        this.map[priority][operation.name] = operation;
    }

    private static addSubmodules() {
        for (let opName in submodules) {
            this.classes[opName] = submodules[opName];
        }
    }
}
