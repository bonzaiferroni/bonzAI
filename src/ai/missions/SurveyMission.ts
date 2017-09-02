import {Mission, MissionMemory, MissionState} from "./Mission";
import {Operation} from "../operations/Operation";
import {helper} from "../../helpers/helper";
import {SurveyAnalyzer} from "./SurveyAnalyzer";
import {Agent} from "../agents/Agent";
import {PosHelper} from "../../helpers/PosHelper";
import {Observationer} from "../Observationer";

interface SurveyMemory extends MissionMemory {
    surveyComplete: boolean;
}

interface SurveyState extends MissionState {
    needsVision: string;
    chosenRoom: {roomName: string, orderDemolition: boolean};
}

export class SurveyMission extends Mission {

    public state: SurveyState;
    public memory: SurveyMemory;

    constructor(operation: Operation) {
        super(operation, "survey");
    }

    public init() { }

    public update() {
        if (this.memory.surveyComplete) { return; }
        let analyzer = new SurveyAnalyzer(this);
        this.state.needsVision = analyzer.run();
    }

    public roleCall() {
    }

    public actions() {
        if (this.state.needsVision) {
            Observationer.observeFromRoom(this.roomName, this.state.needsVision, 3);
        }
    }

    public finalize() {
    }

    public invalidateCache() {
    }
}
