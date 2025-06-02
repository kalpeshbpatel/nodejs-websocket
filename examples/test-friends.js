const Redis = require('ioredis');

// Example Redis friend data setup
async function setupFriendData() {
  const redis = new Redis({
    host: 'localhost',
    port: 6379,
    password: 'scarfall@redis'
  });

  try {
    // Example: User A has User B as friend
    const userA = '683d6aaedb525b175ea8ee40';
    const userB = '683d6adfdb525b175ea8ee46';
    const userC = '683d6aaedb525b175ea8ee41';

    // User A's friends list (User B is a friend)
    await redis.set(`friends:${userA}`, JSON.stringify([
      {
        "_id": userB,
        "email": "jigisha.kb.patel@gmail.com",
        "userId": "jigisha.patel"
      }
    ]));

    // User B's friends list (User A is a friend)
    await redis.set(`friends:${userB}`, JSON.stringify([
      {
        "_id": userA,
        "email": "user.a@example.com",
        "userId": "user.a"
      }
    ]));

    // User C has no friends
    await redis.set(`friends:${userC}`, JSON.stringify([]));

    console.log('Friend data setup complete!');
    console.log(`User A (${userA}) friends: User B`);
    console.log(`User B (${userB}) friends: User A`);
    console.log(`User C (${userC}) friends: none`);
    
    await redis.quit();
  } catch (error) {
    console.error('Error setting up friend data:', error);
    await redis.quit();
  }
}

setupFriendData(); 