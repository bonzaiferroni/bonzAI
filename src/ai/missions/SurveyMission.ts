import {Mission, MissionMemory, MissionState} from "./Mission";
import {Operation} from "../operations/Operation";
import {helper} from "../../helpers/helper";
import {SurveyAnalyzer} from "./SurveyAnalyzer";
import {Agent} from "../agents/Agent";

interface SurveyMemory extends MissionMemory {
    surveyComplete: boolean;
}

interface SurveyState extends MissionState {
    needsVision: string;
    chosenRoom: {roomName: string, orderDemolition: boolean};
}

export class SurveyMission extends Mission {

    private surveyors: Agent[];
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

    private maxSurveyors = () => {
        if (this.state.needsVision && !this.room.findStructures(STRUCTURE_OBSERVER)[0] || this.state.chosenRoom) {
            return 1;
        } else {
            return 0;
        }
    };

    public roleCall() {
        this.surveyors = this.headCount("surveyor", () => this.workerBody(0, 0, 1), this.maxSurveyors);
    }

    public actions() {

        for (let surveyor of this.surveyors) {
            if (this.state.needsVision) {
                this.explorerActions(surveyor);
            }
        }

        if (this.state.needsVision) {
            let observer = this.room.findStructures<StructureObserver>(STRUCTURE_OBSERVER)[0];
            if (!observer) { return; }
            observer.observeRoom(this.state.needsVision);
        }
    }

    public finalize() {
    }

    public invalidateCache() {
    }

    private explorerActions(explorer: Agent) {
        if (this.state.needsVision) {
            explorer.travelTo({pos: helper.pathablePosition(this.state.needsVision)});
        }
    }
}
