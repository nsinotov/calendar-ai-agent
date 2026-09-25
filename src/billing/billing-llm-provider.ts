import type { LlmProvider, LlmRequest, LlmResponse } from "../llm/types.js";
import type { BillingService } from "./billing-service.js";

// Wraps any LlmProvider: records spend after each call and detects the out-of-credits outage.
export class BillingLlmProvider implements LlmProvider {
  constructor(
    private readonly inner: LlmProvider,
    private readonly billing: BillingService,
  ) {}

  async complete(request: LlmRequest): Promise<LlmResponse> {
    try {
      const response = await this.inner.complete(request);
      this.billing.recordSuccess(response.usage);

      return response;
    } catch (error) {
      this.billing.recordFailure(error);
      throw error;
    }
  }
}

