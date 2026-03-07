import { Global, Module } from "@nestjs/common";
import { RolloutService } from "./rollout.service.js";

@Global()
@Module({
  providers: [RolloutService],
  exports: [RolloutService],
})
export class RolloutModule {}
