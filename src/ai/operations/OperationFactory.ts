import {MiningOperation} from "./MiningOperation";
import {KeeperOperation} from "./KeeperOperation";
import {ControllerOperation} from "./ControllerOperation";
import {RaidOperation} from "./RaidOperation";
import {EvacOperation} from "./EvacOperation";
import {LayoutOperation} from "./LayoutOperation";
import {GuardOperation} from "./GuardOperation";
import {SwapOperation} from "./SwapOperation";
import {Operation, OperationMap, OperationPriorityMap} from "./Operation";
import {empire} from "../Empire";

export class OperationFactory {

    private static map: OperationPriorityMap = {};
    private static flagCount: number;
    private static classes = {
        // conquest: ConquestOperation,
        // fort: FortOperation,
        // tran: TransportOperation,
        // demolish: DemolishOperation,
        // quad: QuadOperation,
        // auto: AutoOperation,
        // flex: FlexOperation,
        // zombie: ZombieOperation,
        mining: MiningOperation,
        keeper: KeeperOperation,
        control: ControllerOperation,
        raid: RaidOperation,
        evac: EvacOperation,
        layout: LayoutOperation,
        guard: GuardOperation,
        swap: SwapOperation,
    };

    private static scannedFlags: {[flagName: string]: boolean } = {};

    /**
     * scan for operations flags and instantiate
     */

    public static getOperations(): OperationPriorityMap {

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
                operation.selfInit();
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

        if (global.hasOwnProperty(operation.name)) {
            console.log(`operation with name ${operation.name} already exists (type: ${
                this.map[priority][operation.name].type}), please use a different name`);
        }

        global[operation.name] = operation;
        this.map[priority][operation.name] = operation;
    }
}
