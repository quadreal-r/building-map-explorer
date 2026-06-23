# How to work in this project

## To run the project

- In the top bar of cursor, select view -> terminal
- Type and enter "npm run dev", the project will then be running locally on your machine at "http://localhost:5173/building-map-explorer/"
- Enter that url in the browser to access your site
- Changes to the code will automatically be reflected onto the site, no need to restart the website, you can simply refresh the page


## To make code changes

- When you want to implement something new, you should start a new chat (new agent in top left)
- type "/programmer" first then ask for your feature (ex: "/programmer make all buttons blue")
- When it is done working, it will ask you to verify everything works, keep working with the agent until you are satisfied
- You may want to run the command "npm test" after its done its work, it should say all tests pass - if it doesnt just copy the output of the terminal and give it to the agent and tell it to fix it. Then make sure npm test is all passed and continue to next step.
- Once done, you can say "Everything is good now, push the code"

## Tips
- For complex requests: When you do "/programmer do this feature" press the plus button on the left side of the chat box and select "plan" and then on the far right of the chat box where it says "auto", click that, uncheck auto, then change that to "Opus" and then send your request. It will build out a plan for your feature, the plan should open when its done and you will see a button that says "Build plan" and the agent select next to it "Auto" (leave it on auto) then press build plan. This will generally give you better results for what you want to do 
    - If the request is fairly simple, you don't have to do this whole plan process, you can just do "/programmer do this thing" directly