require('dotenv').config();
const express = require('express');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const NodeCache = require('node-cache');
const cors = require('cors');

const app = express();
app.use(cors());

const cache = new NodeCache({ stdTTL: 300 }); 
const PORT = process.env.PORT || 3000;


const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests, please try again later.'
});
app.use(limiter);

app.get('/github-data', async (req, res) => {
  const cachedData = cache.get('github-data');
  if (cachedData) return res.json(cachedData);

  try {
    const response = await axios.post(
      'https://api.github.com/graphql',
      {
        query: `{
          viewer {
            login
            name
            avatarUrl
            repositories {
              totalCount
            }
            pinnedItems(first: 6, types: REPOSITORY) {
              nodes {
                ... on Repository {
                  name
                  url
                  description
                  stargazerCount
                  forkCount
                  primaryLanguage {
                    name
                    color
                  }
                }
              }
            }
            contributionsCollection {
              contributionCalendar {
                totalContributions
                weeks {
                  contributionDays {
                    contributionCount
                    date
                  }
                }
              }
            }
          }
        }`
      },
      { headers: { Authorization: `Bearer ${process.env.GITHUB_ACCESS_TOKEN}` } }
    );
    cache.set('github-data', response.data, 300);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: 'GitHub API error' });
  }
});


app.get('/leetcode-data', async (req, res) => {
  const { username } = req.query;
  if (!username) {
    return res.status(400).json({ error: 'Username query parameter is required' });
  }

  const cachedData = cache.get(`leetcode-data-${username}`);
  if (cachedData) return res.json(cachedData);

  try {
    const query = {
      query: `query getUserProfile($username: String!) {
        allQuestionsCount { difficulty count }
        matchedUser(username: $username) {
          contributions { points }
          profile { reputation ranking }
          submissionCalendar
          submitStats {
            acSubmissionNum { difficulty count submissions }
            totalSubmissionNum { difficulty count submissions }
          }
        }
      }`,
      variables: { username }
    };

    const response = await axios.post('https://leetcode.com/graphql/', query, {
      headers: {
        'Content-Type': 'application/json',
        'Referer': `https://leetcode.com/${username}/`
      }
    });

    const data = response.data.data;
    if (!data || !data.matchedUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    const submissionCalendar = JSON.parse(data.matchedUser.submissionCalendar);
    const stats = {
      status: 'success',
      message: 'retrieved',
      totalSolved: data.matchedUser.submitStats.acSubmissionNum[0].count,
      totalQuestions: data.allQuestionsCount[0].count,
      easySolved: data.matchedUser.submitStats.acSubmissionNum[1].count,
      totalEasy: data.allQuestionsCount[1].count,
      mediumSolved: data.matchedUser.submitStats.acSubmissionNum[2].count,
      totalMedium: data.allQuestionsCount[2].count,
      hardSolved: data.matchedUser.submitStats.acSubmissionNum[3].count,
      totalHard: data.allQuestionsCount[3].count,
      acceptanceRate: (data.matchedUser.submitStats.acSubmissionNum[0].submissions / data.matchedUser.submitStats.totalSubmissionNum[0].submissions) * 100,
      ranking: data.matchedUser.profile.ranking,
      contributionPoints: data.matchedUser.contributions.points,
      reputation: data.matchedUser.profile.reputation,
      submissionCalendar
    };

    cache.set(`leetcode-data-${username}`, stats, 300);
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: 'LeetCode API error', details: error.message });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
