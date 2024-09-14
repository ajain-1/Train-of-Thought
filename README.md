# Train of Thought

By using two agents to break down a prompt, generate a 
chain of thoughts, and verify subproblem outputs, we saw 
accuracy and safety improvements over a one-shot approach. 
This was inspired by OpenAI's recent o1 model as well as 
research in the field of multi-agent LLMs. Currently, the 
project uses two instances of Google's Gemini Flash 1.5 
model, but this approach can be generalized to any number 
and type of models.

NOTE: Removed Agent Backtracking due to token limits.
Learn more at [our presentation.](https://cmu.box.com/s/xdaft9t8l1v9yvsfsb5evv2p1jfj0t43)