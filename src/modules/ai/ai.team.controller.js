import * as aiService from "./ai.service.js";

export async function teamAssistant(req, res) {
  const result = await aiService.teamAssistant(req.user.sub, req.body);
  res.json(result);
}
