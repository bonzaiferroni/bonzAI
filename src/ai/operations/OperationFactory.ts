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

    /**
     * scan for operations flags and instantiate
     */

    public static getOperations(): OperationPriorityMap {

        // gather flag data, instantiate operations
        for (let flagName in Game.flags) {
            for (let typeName in this.classes) {
                if (flagName.substring(0, typeName.length) !== typeName) { continue; }
                let operationClass = this.classes[typeName];
                let flag = Game.flags[flagName];
                let name = flagName.substring(flagName.indexOf("_") + 1);

                let operation = new operationClass(flag, name, typeName) as Operation;
                let priority = operation.priority;
                if (!this.map[priority]) { this.map[priority] = {}; }

                if (global.hasOwnProperty(name)) {
                    console.log(`operation with name ${name} already exists (type: ${
                        this.map[priority][name].type}), please use a different name`);
                    console.log(`you may ignore this if you are just temporarily adjusting your flags`);
                }

                global[name] = operation;
                this.map[priority][name] = operation;
            }
        }

        this.flagCount = Object.keys(Game.flags).length;
        return this.map;
    }

    public static refreshOperations(operations: OperationPriorityMap) {
        let flagCountThisTick = Object.keys(Game.flags).length;
        if (flagCountThisTick !== this.flagCount || flagCountThisTick !== Memory.flagCount) {
            Memory.flagCount = flagCountThisTick;
            this.flagCount = flagCountThisTick;
            operations = OperationFactory.getOperations();
            Operation.init(operations);
        }

        return operations;
    }
}
