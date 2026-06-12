const command = process.argv[2];

if (command === "tunnel" || command === "webhook") {
  console.log(`slack setup placeholder: ${command}`);
} else {
  throw new Error("usage: slack.ts tunnel|webhook");
}
