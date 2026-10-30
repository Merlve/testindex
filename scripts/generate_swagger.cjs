const fs = require('fs');
const path = require('path');
const YAML = require('yamljs');

const doc = {
  openapi: '3.0.3',
  info: {
    title: 'Shindex Media Server API',
    version: '1.0.0',
    description: 'Comprehensive RESTful API specification for Shindex, a unified media server and dashboard. This API allows external client applications (mobile, TV, web, desktop) to authenticate, stream media files, browse library directory structures, search and match rich TMDB metadata, manage personal watchlists and watch history, curate custom playlists/collections, fetch and stream subtitles, track downloads, and administer the server.'
  },
  servers: [
    {
      url: '/',
      description: 'Current Shindex Server'
    }
  ],
  tags: [
    { name: 'Auth', description: 'Authentication, guest sessions, and token identity' },
    { name: 'FileSystem', description: 'Directory browsing, file metadata, streaming links, and file management via OpenList' },
    { name: 'Metadata', description: 'TMDB movie/TV metadata, posters, backdrops, logos, trailers, and seasons' },
    { name: 'Watchlist', description: 'User personal watchlist management' },
    { name: 'Watched', description: 'Watch history, playback progress, and watched toggling' },
    { name: 'Recommendations', description: 'Personalized media recommendations engine' },
    { name: 'Subtitles', description: 'Subtitle search, WebVTT conversion, daily quota tracking, and downloads' },
    { name: 'Media & Streaming', description: 'Folder archive ZIP downloads, WebDAV status, and image proxy' },
    { name: 'User Collections', description: 'Community lists, playlists, and user collections' },
    { name: 'Downloads', description: 'Download tracking analytics and top downloaded media' },
    { name: 'Jellyfin', description: 'Recently added sync and Jellyfin path overrides' },
    { name: 'AI & Chat', description: 'AI-powered media assistant and recommendations chatbot' },
    { name: 'Configuration', description: 'Server system configuration, announcements, and path mappings' },
    { name: 'Admin', description: 'User expirations, lockout resets, active sessions, diagnostics, and audit logs' }
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'Token / JWT',
        description: 'User or Admin authentication token received from /api/auth/login or /api/auth/guest_login. May be passed as `Bearer <token>` or plain `<token>` in the `Authorization` header.'
      },
      userHeader: {
        type: 'apiKey',
        in: 'header',
        name: 'x-user',
        description: 'Username string used by personalization endpoints (watchlist, watched progress, user collections).'
      }
    },
    schemas: {
      ErrorResponse: {
        type: 'object',
        properties: {
          error: { type: 'string', example: 'Unauthorized' },
          code: { type: 'integer', example: 401 },
          message: { type: 'string', example: 'Invalid credentials or expired session' }
        }
      },
      SuccessResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: 'Operation completed successfully' }
        }
      },
      LoginRequest: {
        type: 'object',
        required: ['username', 'password'],
        properties: {
          username: { type: 'string', example: 'admin' },
          password: { type: 'string', format: 'password', example: 'password123' }
        }
      },
      LoginResponse: {
        type: 'object',
        properties: {
          code: { type: 'integer', example: 200 },
          message: { type: 'string', example: 'success' },
          data: {
            type: 'object',
            properties: {
              id: { type: 'integer', example: 1 },
              username: { type: 'string', example: 'admin' },
              role: { type: 'integer', example: 2, description: 'User role (2 = Admin, 0 = Standard/Guest)' },
              base_path: { type: 'string', example: '/home' },
              permission: { type: 'integer', example: 0 },
              token: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' }
            }
          }
        }
      },
      GuestLoginResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          token: { type: 'string', example: 'guest_4a9f3b18c...' }
        }
      },
      AuthMeResponse: {
        type: 'object',
        properties: {
          code: { type: 'integer', example: 200 },
          message: { type: 'string', example: 'success' },
          data: {
            type: 'object',
            properties: {
              id: { type: 'integer', example: 1 },
              username: { type: 'string', example: 'admin' },
              role: { type: 'integer', example: 2 },
              base_path: { type: 'string', example: '/home' },
              permission: { type: 'integer', example: 0 },
              disabled: { type: 'boolean', example: false }
            }
          }
        }
      },
      FsItem: {
        type: 'object',
        properties: {
          name: { type: 'string', example: 'Dune.Part.Two.2024.1080p.mkv' },
          size: { type: 'integer', example: 5242880000, description: 'File size in bytes' },
          is_dir: { type: 'boolean', example: false },
          modified: { type: 'string', example: '2024-03-01T12:00:00Z' },
          created: { type: 'string', example: '2024-03-01T12:00:00Z' },
          sign: { type: 'string', example: 'abc123sign' },
          thumb: { type: 'string', example: '' },
          type: { type: 'integer', example: 2, description: '1: folder, 2: video, 3: audio, etc.' },
          raw_url: { type: 'string', example: 'https://cdn.example.com/stream/dune2.mkv' }
        }
      },
      FsListRequest: {
        type: 'object',
        properties: {
          reqPath: { type: 'string', example: '/home/MOVIES', description: 'Folder path to list (defaults to server basePath)' },
          refresh: { type: 'boolean', example: false, description: 'Force refresh cache from storage provider' }
        }
      },
      FsListResponse: {
        type: 'object',
        properties: {
          code: { type: 'integer', example: 200 },
          message: { type: 'string', example: 'success' },
          data: {
            type: 'object',
            properties: {
              content: {
                type: 'array',
                items: { $ref: '#/components/schemas/FsItem' }
              },
              total: { type: 'integer', example: 45 },
              readme: { type: 'string', example: '' },
              header: { type: 'string', example: '' }
            }
          }
        }
      },
      FsGetRequest: {
        type: 'object',
        required: ['reqPath'],
        properties: {
          reqPath: { type: 'string', example: '/home/MOVIES/Dune.2024.mkv' }
        }
      },
      FsGetResponse: {
        type: 'object',
        properties: {
          code: { type: 'integer', example: 200 },
          message: { type: 'string', example: 'success' },
          data: {
            type: 'object',
            properties: {
              name: { type: 'string', example: 'Dune.2024.mkv' },
              size: { type: 'integer', example: 5242880000 },
              is_dir: { type: 'boolean', example: false },
              modified: { type: 'string', example: '2024-03-01T12:00:00Z' },
              raw_url: { type: 'string', example: 'https://cdn.example.com/stream/dune2.mkv' },
              provider: { type: 'string', example: 'OpenList / AList' }
            }
          }
        }
      },
      FsSearchRequest: {
        type: 'object',
        required: ['keywords'],
        properties: {
          keywords: { type: 'string', example: 'Interstellar', description: 'Search term, IMDb ID (tt...), or TMDB ID' },
          parent: { type: 'string', example: '/home', description: 'Parent path scope for search' }
        }
      },
      FsSearchResponse: {
        type: 'object',
        properties: {
          code: { type: 'integer', example: 200 },
          message: { type: 'string', example: 'success' },
          data: {
            type: 'object',
            properties: {
              content: {
                type: 'array',
                items: { $ref: '#/components/schemas/FsItem' }
              },
              total: { type: 'integer', example: 1 }
            }
          }
        }
      },
      FsRemoveRequest: {
        type: 'object',
        required: ['names', 'dir'],
        properties: {
          names: {
            type: 'array',
            items: { type: 'string' },
            example: ['old_movie.mkv']
          },
          dir: { type: 'string', example: '/home/MOVIES' }
        }
      },
      TmdbItem: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 693134 },
          title: { type: 'string', example: 'Dune: Part Two' },
          name: { type: 'string', example: 'Dune: Part Two' },
          overview: { type: 'string', example: 'Follow the mythic journey of Paul Atreides...' },
          poster_path: { type: 'string', example: '/czembW0Rk1Ke7lCJGhkAiBhQ9la.jpg' },
          backdrop_path: { type: 'string', example: '/xOMo8BRK7PfcJv9JCnx7s520b22.jpg' },
          release_date: { type: 'string', example: '2024-02-27' },
          first_air_date: { type: 'string', example: '' },
          vote_average: { type: 'number', example: 8.2 },
          vote_count: { type: 'integer', example: 4500 },
          genre_ids: {
            type: 'array',
            items: { type: 'integer' },
            example: [878, 12]
          },
          genres: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'integer' },
                name: { type: 'string' }
              }
            }
          },
          media_type: { type: 'string', example: 'movie' },
          runtime: { type: 'integer', example: 166 },
          logo_path: { type: 'string', example: '/path_to_logo.png' },
          custom_logo: { type: 'string', example: 'https://example.com/logo.png' }
        }
      },
      TmdbEpisode: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 12345 },
          name: { type: 'string', example: 'Chapter One' },
          overview: { type: 'string', example: 'Episode summary...' },
          air_date: { type: 'string', example: '2023-01-15' },
          episode_number: { type: 'integer', example: 1 },
          season_number: { type: 'integer', example: 1 },
          still_path: { type: 'string', example: '/still.jpg' },
          vote_average: { type: 'number', example: 8.5 }
        }
      },
      TmdbSeason: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 789 },
          name: { type: 'string', example: 'Season 1' },
          season_number: { type: 'integer', example: 1 },
          overview: { type: 'string', example: 'Season overview' },
          poster_path: { type: 'string', example: '/season1.jpg' },
          episodes: {
            type: 'array',
            items: { $ref: '#/components/schemas/TmdbEpisode' }
          }
        }
      },
      WatchlistItem: {
        type: 'object',
        properties: {
          name: { type: 'string', example: 'Dune: Part Two' },
          path: { type: 'string', example: 'MOVIES/Dune.Part.Two.2024' },
          parentPath: { type: 'string', example: 'MOVIES' },
          category: { type: 'string', example: 'MOVIES' },
          addedAt: { type: 'integer', example: 1709294400000 },
          tmdbData: { $ref: '#/components/schemas/TmdbItem' }
        }
      },
      WatchlistToggleRequest: {
        type: 'object',
        properties: {
          item: { type: 'object' },
          category: { type: 'string', example: 'MOVIES' },
          parentPath: { type: 'string', example: 'MOVIES' },
          action: { type: 'string', enum: ['add', 'remove', 'toggle'], example: 'toggle' },
          watchlisted: { type: 'boolean', example: true },
          tmdbData: { $ref: '#/components/schemas/TmdbItem' }
        }
      },
      WatchedItem: {
        type: 'object',
        properties: {
          name: { type: 'string', example: 'S01E01.mkv' },
          parentPath: { type: 'string', example: 'SERIES/Breaking.Bad/Season.1' },
          timestamp: { type: 'integer', example: 1709294400000 },
          showName: { type: 'string', example: 'Breaking Bad' },
          showPath: { type: 'string', example: 'SERIES/Breaking.Bad' },
          tmdbId: { type: 'integer', example: 1396 },
          tmdbData: { $ref: '#/components/schemas/TmdbItem' }
        }
      },
      WatchedToggleRequest: {
        type: 'object',
        required: ['name', 'parentPath'],
        properties: {
          name: { type: 'string', example: 'S01E01.mkv' },
          parentPath: { type: 'string', example: 'SERIES/Breaking.Bad/Season.1' },
          action: { type: 'string', enum: ['record', 'toggle'], example: 'record' },
          showName: { type: 'string', example: 'Breaking Bad' },
          showPath: { type: 'string', example: 'SERIES/Breaking.Bad' },
          tmdbId: { type: 'integer', example: 1396 },
          tmdbData: { $ref: '#/components/schemas/TmdbItem' }
        }
      },
      WatchedBulkToggleRequest: {
        type: 'object',
        required: ['items'],
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              required: ['name', 'parentPath'],
              properties: {
                name: { type: 'string', example: 'S01E01.mkv' },
                parentPath: { type: 'string', example: 'SERIES/Breaking.Bad/Season.1' },
                watched: { type: 'boolean', example: true },
                showName: { type: 'string', example: 'Breaking Bad' },
                showPath: { type: 'string', example: 'SERIES/Breaking.Bad' },
                tmdbId: { type: 'integer', example: 1396 },
                tmdbData: { $ref: '#/components/schemas/TmdbItem' }
              }
            }
          }
        }
      },
      UserCollection: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'col_1711200000_abcde' },
          name: { type: 'string', example: 'Sci-Fi Masterpieces' },
          description: { type: 'string', example: 'Best sci-fi movies of all time' },
          authorName: { type: 'string', example: 'Cinephile' },
          createdBy: { type: 'string', example: 'admin' },
          isPublic: { type: 'boolean', example: true },
          categoryTag: { type: 'string', example: 'Lists' },
          items: {
            type: 'array',
            items: { type: 'object' }
          },
          upvotes: {
            type: 'array',
            items: { type: 'string' },
            example: ['admin', 'john']
          },
          createdAt: { type: 'integer', example: 1711200000000 },
          updatedAt: { type: 'integer', example: 1711200000000 }
        }
      },
      CreateUserCollectionRequest: {
        type: 'object',
        required: ['name', 'authorName'],
        properties: {
          name: { type: 'string', example: 'Favorite Anime' },
          description: { type: 'string', example: 'Must-watch anime series' },
          authorName: { type: 'string', example: 'OtakuUser' },
          isPublic: { type: 'boolean', example: true },
          categoryTag: { type: 'string', example: 'Anime' },
          items: {
            type: 'array',
            items: { type: 'object' }
          }
        }
      },
      UpdateUserCollectionRequest: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          authorName: { type: 'string' },
          isPublic: { type: 'boolean' },
          categoryTag: { type: 'string' },
          items: {
            type: 'array',
            items: { type: 'object' }
          }
        }
      },
      SubtitleQuota: {
        type: 'object',
        properties: {
          username: { type: 'string', example: 'john' },
          isAdmin: { type: 'boolean', example: false },
          limit: { oneOf: [{ type: 'integer' }, { type: 'string' }], example: 20 },
          used: { type: 'integer', example: 3 },
          remaining: { oneOf: [{ type: 'integer' }, { type: 'string' }], example: 17 }
        }
      },
      DownloadTrackRequest: {
        type: 'object',
        properties: {
          title: { type: 'string', example: 'Inception (2010)' },
          fileName: { type: 'string', example: 'Inception.2010.1080p.mkv' },
          category: { type: 'string', example: 'MOVIES' },
          isShow: { type: 'boolean', example: false },
          count: { type: 'integer', example: 1 }
        }
      },
      DownloadItem: {
        type: 'object',
        properties: {
          title: { type: 'string', example: 'Inception' },
          category: { type: 'string', example: 'MOVIES' },
          count: { type: 'integer', example: 42 },
          lastDownloaded: { type: 'integer', example: 1709294400000 },
          isShow: { type: 'boolean', example: false }
        }
      },
      AppConfig: {
        type: 'object',
        properties: {
          openlistUrl: { type: 'string', example: 'https://openlist.example.com' },
          basePath: { type: 'string', example: '/home' },
          inactivityTimeout: { type: 'integer', example: 30 },
          announcement: { type: 'string', example: 'Welcome to Shindex!' },
          unreleasedTmdbIds: {
            type: 'array',
            items: { type: 'integer' },
            example: [12345]
          },
          digitalReleasePaths: {
            type: 'object',
            additionalProperties: { type: 'string' },
            example: { '693134': '/home/MOVIES/Dune.Part.Two.2024' }
          }
        }
      },
      ChatRequest: {
        type: 'object',
        required: ['message'],
        properties: {
          message: { type: 'string', example: 'Recommend me a mind-bending sci-fi movie' },
          history: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                role: { type: 'string', enum: ['user', 'model'], example: 'user' },
                parts: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      text: { type: 'string', example: 'Hi' }
                    }
                  }
                }
              }
            }
          }
        }
      },
      ChatResponse: {
        type: 'object',
        properties: {
          reply: { type: 'string', example: 'I highly recommend Inception and Interstellar...' }
        }
      },
      ScanStatus: {
        type: 'object',
        properties: {
          isRunning: { type: 'boolean', example: false },
          message: { type: 'string', example: 'Idle' },
          count: { type: 'integer', example: 120 },
          total: { type: 'integer', example: 350 },
          failedItems: {
            type: 'array',
            items: { type: 'object' }
          }
        }
      },
      UserExpirationItem: {
        type: 'object',
        properties: {
          userId: { type: 'integer', example: 12 },
          expirationDate: { type: 'string', example: '2026-12-31T23:59:59.000Z' }
        }
      },
      UserLockoutItem: {
        type: 'object',
        properties: {
          failedAttempts: { type: 'integer', example: 3 },
          locked: { type: 'boolean', example: false },
          lastAttempt: { type: 'string', example: '2024-03-01T12:00:00Z' }
        }
      },
      AdminSessionItem: {
        type: 'object',
        properties: {
          username: { type: 'string', example: 'john' },
          token: { type: 'string', example: 'token123...' },
          loginTime: { type: 'integer', example: 1709294400000 },
          ip: { type: 'string', example: '192.168.1.1' },
          userAgent: { type: 'string', example: 'Mozilla/5.0...' }
        }
      },
      AdminLogItem: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          action: { type: 'string', example: 'User Login' },
          username: { type: 'string', example: 'john' },
          details: { type: 'string', example: 'Logged in from 192.168.1.1' },
          timestamp: { type: 'string', example: '2024-03-01T12:00:00Z' }
        }
      }
    }
  },
  paths: {}
};

// Helper for building endpoints
function addPath(pathName, method, config) {
  if (!doc.paths[pathName]) {
    doc.paths[pathName] = {};
  }
  doc.paths[pathName][method.toLowerCase()] = config;
}

// 1. Auth endpoints
addPath('/api/auth/login', 'POST', {
  tags: ['Auth'],
  summary: 'User Login',
  description: 'Authenticate an existing user or administrator account. Checks account lockout and expiration status. Returns auth token and user profile.',
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/LoginRequest' }
      }
    }
  },
  responses: {
    '200': {
      description: 'Successfully authenticated',
      content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginResponse' } } }
    },
    '400': { description: 'Missing username or password', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
    '403': { description: 'Account locked or expired', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
  }
});

addPath('/api/auth/guest_login', 'POST', {
  tags: ['Auth'],
  summary: 'Guest Login',
  description: 'Generate a 24-hour temporary guest session token. Restricted to once per 24 hours per IP address.',
  responses: {
    '200': {
      description: 'Guest token issued',
      content: { 'application/json': { schema: { $ref: '#/components/schemas/GuestLoginResponse' } } }
    },
    '429': { description: 'Guest rate limit reached (1 login per 24 hours)', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
  }
});

addPath('/api/auth/me', 'GET', {
  tags: ['Auth'],
  summary: 'Current User Identity',
  description: 'Verify the active token and retrieve user profile details, roles, and storage permissions.',
  security: [{ bearerAuth: [] }],
  responses: {
    '200': {
      description: 'User profile retrieved',
      content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthMeResponse' } } }
    },
    '401': { description: 'Invalid or expired session token', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
  }
});

addPath('/api/me', 'GET', {
  tags: ['Auth'],
  summary: 'Current User Identity (Alias)',
  description: 'Direct alias to `/api/auth/me`.',
  security: [{ bearerAuth: [] }],
  responses: {
    '200': {
      description: 'User profile retrieved',
      content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthMeResponse' } } }
    }
  }
});

// 2. FileSystem endpoints
addPath('/api/fs/list', 'POST', {
  tags: ['FileSystem'],
  summary: 'List Directory Contents',
  description: 'Retrieve media files and subdirectories for a specified path. Results are cached with stale-while-revalidate. Supports force refresh.',
  security: [{ bearerAuth: [] }],
  requestBody: {
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/FsListRequest' }
      }
    }
  },
  responses: {
    '200': {
      description: 'Directory listing',
      content: { 'application/json': { schema: { $ref: '#/components/schemas/FsListResponse' } } }
    },
    '403': { description: 'Forbidden access to path outside base path' }
  }
});

addPath('/api/fs/get', 'POST', {
  tags: ['FileSystem'],
  summary: 'Get File Details & Stream URL',
  description: 'Retrieve direct streaming URL, size, mime type, and metadata for a specific media file.',
  security: [{ bearerAuth: [] }],
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/FsGetRequest' }
      }
    }
  },
  responses: {
    '200': {
      description: 'File metadata and direct streaming URL',
      content: { 'application/json': { schema: { $ref: '#/components/schemas/FsGetResponse' } } }
    },
    '400': { description: 'Missing path' },
    '403': { description: 'Forbidden access' }
  }
});

addPath('/api/fs/search', 'POST', {
  tags: ['FileSystem'],
  summary: 'Search Filesystem',
  description: 'Search files and folders by keywords. Supports IMDb ID (tt...) and TMDB ID prefix resolution.',
  security: [{ bearerAuth: [] }],
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/FsSearchRequest' }
      }
    }
  },
  responses: {
    '200': {
      description: 'Search results matching keywords',
      content: { 'application/json': { schema: { $ref: '#/components/schemas/FsSearchResponse' } } }
    }
  }
});

addPath('/api/fs/remove', 'POST', {
  tags: ['FileSystem'],
  summary: 'Remove Files/Folders',
  description: 'Delete files or directories from storage. Restricted to logged in users (guests forbidden).',
  security: [{ bearerAuth: [] }],
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/FsRemoveRequest' }
      }
    }
  },
  responses: {
    '200': { description: 'Files removed successfully' },
    '403': { description: 'Guests cannot remove files' }
  }
});

// 3. Metadata & TMDB
addPath('/api/meta/search', 'GET', {
  tags: ['Metadata'],
  summary: 'Search TMDB Metadata',
  description: 'Fetch matched TMDB metadata for a media title. Checks local cache, custom overrides, and fallback TMDB queries.',
  security: [{ bearerAuth: [] }],
  parameters: [
    { name: 'query', in: 'query', required: true, schema: { type: 'string' }, description: 'Title to search for' },
    { name: 'type', in: 'query', schema: { type: 'string', enum: ['movie', 'tv'] }, description: 'Media category or type' },
    { name: 'year', in: 'query', schema: { type: 'string' }, description: 'Release year' },
    { name: 'tmdbId', in: 'query', schema: { type: 'integer' }, description: 'Explicit TMDB ID' },
    { name: 'path', in: 'query', schema: { type: 'string' }, description: 'Library item path for override matching' },
    { name: 'full', in: 'query', schema: { type: 'string' }, description: 'Whether to attach full credits and keywords' }
  ],
  responses: {
    '200': {
      description: 'TMDB metadata record',
      content: { 'application/json': { schema: { $ref: '#/components/schemas/TmdbItem' } } }
    }
  }
});

addPath('/api/meta/search_all', 'GET', {
  tags: ['Metadata'],
  summary: 'Multi-Match TMDB Search',
  description: 'Search TMDB and return multiple candidate matches across movies and TV series (useful for fix/match modals).',
  security: [{ bearerAuth: [] }],
  parameters: [
    { name: 'query', in: 'query', required: true, schema: { type: 'string' } },
    { name: 'type', in: 'query', schema: { type: 'string' } },
    { name: 'year', in: 'query', schema: { type: 'string' } }
  ],
  responses: {
    '200': {
      description: 'Array of candidate TMDB matches',
      content: { 'application/json': { schema: { type: 'object', properties: { results: { type: 'array', items: { $ref: '#/components/schemas/TmdbItem' } } } } } }
    }
  }
});

addPath('/api/meta/videos', 'GET', {
  tags: ['Metadata'],
  summary: 'Fetch Media Trailers & Videos',
  description: 'Fetch official YouTube trailers, teasers, and video clips from TMDB.',
  security: [{ bearerAuth: [] }],
  parameters: [
    { name: 'id', in: 'query', required: true, schema: { type: 'integer' }, description: 'TMDB Media ID' },
    { name: 'type', in: 'query', required: true, schema: { type: 'string' }, description: 'movie or tv' }
  ],
  responses: {
    '200': { description: 'Trailers and videos collection' }
  }
});

addPath('/api/meta/images', 'GET', {
  tags: ['Metadata'],
  summary: 'Fetch Media Images (Backdrops, Posters, Logos)',
  description: 'Fetch high-resolution backdrops, poster art, and transparent logos with language priority.',
  security: [{ bearerAuth: [] }],
  parameters: [
    { name: 'id', in: 'query', required: true, schema: { type: 'integer' }, description: 'TMDB Media ID' },
    { name: 'type', in: 'query', required: true, schema: { type: 'string' } },
    { name: 'lang', in: 'query', schema: { type: 'string', default: 'en,null' } }
  ],
  responses: {
    '200': { description: 'Images collection containing logos, backdrops, and posters' }
  }
});

addPath('/api/meta/release_dates', 'GET', {
  tags: ['Metadata'],
  summary: 'Fetch Theatrical & Digital Release Dates',
  description: 'Returns official digital and physical home release dates for movies from TMDB.',
  parameters: [
    { name: 'id', in: 'query', required: true, schema: { type: 'integer' } }
  ],
  responses: {
    '200': {
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: { digital_release_date: { type: 'string', nullable: true, example: '2024-04-16' } }
          }
        }
      }
    }
  }
});

addPath('/api/meta/version', 'GET', {
  tags: ['Metadata'],
  summary: 'Get Metadata Cache Version',
  description: 'Returns current cache version timestamp. Clients use this to detect when metadata has been updated or reset.',
  responses: {
    '200': {
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: { version: { type: 'integer', example: 1711200000000 } }
          }
        }
      }
    }
  }
});

addPath('/api/meta/tv_details', 'GET', {
  tags: ['Metadata'],
  summary: 'Fetch TV Series Details',
  description: 'Retrieve full series details including list of seasons, episode counts, creators, and cast.',
  security: [{ bearerAuth: [] }],
  parameters: [
    { name: 'tvId', in: 'query', required: true, schema: { type: 'integer' } }
  ],
  responses: {
    '200': { description: 'Full TV show information' }
  }
});

addPath('/api/meta/tv_season', 'GET', {
  tags: ['Metadata'],
  summary: 'Fetch TV Season & Episode Details',
  description: 'Retrieve all episode metadata, titles, overviews, still images, and air dates for a specific season.',
  security: [{ bearerAuth: [] }],
  parameters: [
    { name: 'tvId', in: 'query', required: true, schema: { type: 'integer' } },
    { name: 'season', in: 'query', required: true, schema: { type: 'integer' } }
  ],
  responses: {
    '200': {
      content: { 'application/json': { schema: { $ref: '#/components/schemas/TmdbSeason' } } }
    }
  }
});

addPath('/api/meta/collections', 'GET', {
  tags: ['Metadata'],
  summary: 'Get Movie Franchise Collections',
  description: 'Fetch aggregated movie franchise collections (e.g. Harry Potter, Marvel Cinematic Universe) discovered in the library.',
  security: [{ bearerAuth: [] }],
  responses: {
    '200': { description: 'Map of movie collections indexed by collection ID' }
  }
});

addPath('/api/meta/genres/backdrops', 'GET', {
  tags: ['Metadata'],
  summary: 'Genre Backdrop Mapping',
  description: 'Returns high-quality curated backdrop images for all TMDB genre IDs.',
  responses: {
    '200': {
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              genres: { type: 'object', additionalProperties: { type: 'string' } }
            }
          }
        }
      }
    }
  }
});

addPath('/api/meta/genre/{genreId}', 'GET', {
  tags: ['Metadata'],
  summary: 'Browse Library Items by Genre',
  description: 'Fetch library items matching a specified TMDB Genre ID.',
  security: [{ bearerAuth: [] }],
  parameters: [
    { name: 'genreId', in: 'path', required: true, schema: { type: 'integer' } }
  ],
  responses: {
    '200': { description: 'Items in library matching genre' }
  }
});

addPath('/api/meta/digital-releases-strict', 'GET', {
  tags: ['Metadata'],
  summary: 'Discover Digital Releases in Date Range',
  description: 'Query TMDB Discover API for digital movie releases between gte and lte dates.',
  parameters: [
    { name: 'gte', in: 'query', required: true, schema: { type: 'string', example: '2024-01-01' } },
    { name: 'lte', in: 'query', required: true, schema: { type: 'string', example: '2024-03-31' } }
  ],
  responses: {
    '200': { description: 'Array of digital releases' }
  }
});

addPath('/api/meta/discover', 'GET', {
  tags: ['Metadata'],
  summary: 'TMDB Discover Movie Filter',
  description: 'Proxy to TMDB Discover endpoint for filtering movies by genre, sort order, and release dates.',
  responses: {
    '200': { description: 'TMDB Discover results' }
  }
});

addPath('/api/meta/trending', 'GET', {
  tags: ['Metadata'],
  summary: 'Daily Trending Media',
  description: 'Fetch daily trending movies and TV shows from TMDB.',
  responses: {
    '200': { description: 'Daily trending items' }
  }
});

addPath('/api/meta/override', 'POST', {
  tags: ['Metadata'],
  summary: 'Set Media Metadata Override',
  description: 'Manually override TMDB matching ID, custom title, year, or custom logo for a specific file or folder in the library.',
  security: [{ bearerAuth: [] }],
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: ['query'],
          properties: {
            query: { type: 'string', example: 'dune.2024' },
            type: { type: 'string', example: 'MOVIES' },
            year: { type: 'string', example: '2024' },
            tmdbId: { type: 'integer', example: 693134 },
            customTitle: { type: 'string' },
            customYear: { type: 'string' },
            customLogo: { type: 'string' },
            path: { type: 'string' }
          }
        }
      }
    }
  },
  responses: {
    '200': { description: 'Override saved successfully' }
  }
});

addPath('/api/meta/correct', 'POST', {
  tags: ['Metadata'],
  summary: 'Correct TMDB Metadata (Admin)',
  description: 'Directly update and sync TMDB cache object for an item.',
  security: [{ bearerAuth: [] }],
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: ['query', 'data'],
          properties: {
            query: { type: 'string' },
            type: { type: 'string' },
            year: { type: 'string' },
            data: { type: 'object' }
          }
        }
      }
    }
  },
  responses: {
    '200': { description: 'Metadata cache corrected' }
  }
});

addPath('/api/meta/batch', 'POST', {
  tags: ['Metadata'],
  summary: 'Batch TMDB Metadata Fetch (Admin)',
  description: 'Batch process multiple items to retrieve TMDB metadata.',
  security: [{ bearerAuth: [] }],
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: ['items'],
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  query: { type: 'string' },
                  type: { type: 'string' },
                  year: { type: 'string' },
                  originalName: { type: 'string' }
                }
              }
            }
          }
        }
      }
    }
  },
  responses: {
    '200': { description: 'Batch metadata lookup map' }
  }
});

addPath('/api/meta/unrelease', 'POST', {
  tags: ['Metadata'],
  summary: 'Mark / Unmark Title as Unreleased (Admin)',
  security: [{ bearerAuth: [] }],
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: ['tmdbId'],
          properties: {
            tmdbId: { type: 'integer' },
            unrelease: { type: 'boolean' }
          }
        }
      }
    }
  },
  responses: {
    '200': { description: 'Unrelease state updated' }
  }
});

addPath('/api/meta/digital-path', 'POST', {
  tags: ['Metadata'],
  summary: 'Set Digital Release Path Mapping (Admin)',
  security: [{ bearerAuth: [] }],
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: ['tmdbId'],
          properties: {
            tmdbId: { type: 'integer' },
            path: { type: 'string' }
          }
        }
      }
    }
  },
  responses: {
    '200': { description: 'Digital path mapped' }
  }
});

// Scan jobs
addPath('/api/meta/scan_files/status', 'GET', {
  tags: ['Metadata'],
  summary: 'Files Scan Job Status',
  responses: { '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/ScanStatus' } } } } }
});
addPath('/api/meta/scan_files/start', 'POST', {
  tags: ['Metadata'],
  summary: 'Start Files Scan Job (Admin)',
  security: [{ bearerAuth: [] }],
  responses: { '200': { description: 'Scan started' } }
});
addPath('/api/meta/scan_files/stop', 'POST', {
  tags: ['Metadata'],
  summary: 'Stop Files Scan Job (Admin)',
  security: [{ bearerAuth: [] }],
  responses: { '200': { description: 'Scan stopped' } }
});

addPath('/api/meta/scan_images/status', 'GET', {
  tags: ['Metadata'],
  summary: 'Images Scan Job Status',
  responses: { '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/ScanStatus' } } } } }
});
addPath('/api/meta/scan_images/start', 'POST', {
  tags: ['Metadata'],
  summary: 'Start Images Scan Job (Admin)',
  security: [{ bearerAuth: [] }],
  responses: { '200': { description: 'Scan started' } }
});
addPath('/api/meta/scan_images/stop', 'POST', {
  tags: ['Metadata'],
  summary: 'Stop Images Scan Job (Admin)',
  security: [{ bearerAuth: [] }],
  responses: { '200': { description: 'Scan stopped' } }
});

addPath('/api/meta/scan_collections/status', 'GET', {
  tags: ['Metadata'],
  summary: 'Collections Scan Job Status',
  responses: { '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/ScanStatus' } } } } }
});
addPath('/api/meta/scan_collections/start', 'POST', {
  tags: ['Metadata'],
  summary: 'Start Collections Scan Job (Admin)',
  security: [{ bearerAuth: [] }],
  responses: { '200': { description: 'Scan started' } }
});
addPath('/api/meta/scan_collections/stop', 'POST', {
  tags: ['Metadata'],
  summary: 'Stop Collections Scan Job (Admin)',
  security: [{ bearerAuth: [] }],
  responses: { '200': { description: 'Scan stopped' } }
});

addPath('/api/meta/autofetch/status', 'GET', {
  tags: ['Metadata'],
  summary: 'TMDB Autofetch Job Status',
  responses: { '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/ScanStatus' } } } } }
});
addPath('/api/meta/autofetch/start', 'POST', {
  tags: ['Metadata'],
  summary: 'Start TMDB Autofetch Job (Admin)',
  security: [{ bearerAuth: [] }],
  requestBody: {
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: { targetPath: { type: 'string', example: '/home' } }
        }
      }
    }
  },
  responses: { '200': { description: 'Autofetch started' } }
});
addPath('/api/meta/autofetch/stop', 'POST', {
  tags: ['Metadata'],
  summary: 'Stop TMDB Autofetch Job (Admin)',
  security: [{ bearerAuth: [] }],
  responses: { '200': { description: 'Autofetch stopped' } }
});

// 4. Watchlist
addPath('/api/watchlist', 'GET', {
  tags: ['Watchlist'],
  summary: 'Get User Watchlist',
  description: 'Retrieve all movies and series saved to the authenticated user\'s personal watchlist.',
  security: [{ bearerAuth: [] }, { userHeader: [] }],
  responses: {
    '200': {
      content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/WatchlistItem' } } } }
    },
    '401': { description: 'Unauthorized' }
  }
});

addPath('/api/watchlist', 'DELETE', {
  tags: ['Watchlist'],
  summary: 'Remove from Watchlist via Query',
  security: [{ bearerAuth: [] }, { userHeader: [] }],
  parameters: [
    { name: 'name', in: 'query', schema: { type: 'string' } },
    { name: 'parentPath', in: 'query', schema: { type: 'string' } },
    { name: 'path', in: 'query', schema: { type: 'string' } },
    { name: 'tmdbId', in: 'query', schema: { type: 'integer' } }
  ],
  responses: {
    '200': { description: 'Item removed from watchlist' }
  }
});

addPath('/api/watchlist/toggle', 'POST', {
  tags: ['Watchlist'],
  summary: 'Toggle Item in Watchlist',
  description: 'Add or remove a media title from the user\'s watchlist.',
  security: [{ bearerAuth: [] }, { userHeader: [] }],
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/WatchlistToggleRequest' }
      }
    }
  },
  responses: {
    '200': { description: 'Updated watchlist' },
    '401': { description: 'Unauthorized' }
  }
});

addPath('/api/watchlist/remove', 'POST', {
  tags: ['Watchlist'],
  summary: 'Remove Item from Watchlist',
  security: [{ bearerAuth: [] }, { userHeader: [] }],
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            path: { type: 'string' },
            parentPath: { type: 'string' },
            tmdbData: { type: 'object' }
          }
        }
      }
    }
  },
  responses: {
    '200': { description: 'Item removed' }
  }
});

addPath('/api/watchlist/check', 'GET', {
  tags: ['Watchlist'],
  summary: 'Check Watchlist Status',
  security: [{ bearerAuth: [] }, { userHeader: [] }],
  parameters: [
    { name: 'name', in: 'query', schema: { type: 'string' } },
    { name: 'path', in: 'query', schema: { type: 'string' } },
    { name: 'parentPath', in: 'query', schema: { type: 'string' } },
    { name: 'tmdbId', in: 'query', schema: { type: 'integer' } }
  ],
  responses: {
    '200': {
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: { inWatchlist: { type: 'boolean', example: true } }
          }
        }
      }
    }
  }
});

// 5. Watched
addPath('/api/watched', 'GET', {
  tags: ['Watched'],
  summary: 'Get Watched Media History',
  description: 'Retrieve list of all watched movies and TV episodes for the authenticated user.',
  security: [{ bearerAuth: [] }, { userHeader: [] }],
  responses: {
    '200': {
      content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/WatchedItem' } } } }
    }
  }
});

addPath('/api/watched/toggle', 'POST', {
  tags: ['Watched'],
  summary: 'Toggle Watched Status',
  description: 'Toggle or record watched status for a movie or TV episode.',
  security: [{ bearerAuth: [] }, { userHeader: [] }],
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/WatchedToggleRequest' }
      }
    }
  },
  responses: {
    '200': { description: 'Watched status toggled' }
  }
});

addPath('/api/watched/record', 'POST', {
  tags: ['Watched'],
  summary: 'Record Playback Progress',
  description: 'Mark a video episode or movie as watched / in progress with timestamp.',
  security: [{ bearerAuth: [] }, { userHeader: [] }],
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/WatchedToggleRequest' }
      }
    }
  },
  responses: {
    '200': { description: 'Progress recorded' }
  }
});

addPath('/api/watched/bulk-toggle', 'POST', {
  tags: ['Watched'],
  summary: 'Bulk Toggle Watched Items',
  description: 'Mark multiple episodes or movies as watched or unwatched in a single batch (e.g. mark entire season as watched).',
  security: [{ bearerAuth: [] }, { userHeader: [] }],
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/WatchedBulkToggleRequest' }
      }
    }
  },
  responses: {
    '200': { description: 'Bulk toggle complete' }
  }
});

// 6. Recommendations
addPath('/api/recommendations', 'GET', {
  tags: ['Recommendations'],
  summary: 'Get Personalized Recommendations',
  description: 'Generates recommendations dynamically based on titles in user\'s watchlist and viewing history.',
  security: [{ bearerAuth: [] }, { userHeader: [] }],
  parameters: [
    { name: 'refresh', in: 'query', schema: { type: 'boolean' }, description: 'Force recomputation of recommendations' }
  ],
  responses: {
    '200': {
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              results: { type: 'array', items: { $ref: '#/components/schemas/TmdbItem' } },
              message: { type: 'string', example: 'ADD_MORE' },
              count: { type: 'integer', example: 3 }
            }
          }
        }
      }
    }
  }
});

// 7. Subtitles
addPath('/api/subtitles', 'GET', {
  tags: ['Subtitles'],
  summary: 'Search & Convert Subtitles to WebVTT',
  description: 'Fetch subtitles for media item. Converts ASS/SSA/SRT subtitles to WebVTT automatically with caching.',
  parameters: [
    { name: 'tmdb_id', in: 'query', required: true, schema: { type: 'integer' } },
    { name: 'type', in: 'query', schema: { type: 'string', enum: ['movie', 'tv', 'episode'] } },
    { name: 'season', in: 'query', schema: { type: 'integer' } },
    { name: 'episode', in: 'query', schema: { type: 'integer' } },
    { name: 'language', in: 'query', schema: { type: 'string', default: 'en' } }
  ],
  responses: {
    '200': {
      description: 'WebVTT Subtitle File content',
      content: { 'text/vtt': { schema: { type: 'string' } } }
    }
  }
});

addPath('/api/subtitles/quota', 'GET', {
  tags: ['Subtitles'],
  summary: 'Check Daily Subtitle Quota',
  description: 'Returns the daily subtitle downloads used and remaining (standard users: 20/day, admins: unlimited).',
  security: [{ bearerAuth: [] }],
  responses: {
    '200': {
      content: { 'application/json': { schema: { $ref: '#/components/schemas/SubtitleQuota' } } }
    }
  }
});

addPath('/api/subtitles/download', 'GET', {
  tags: ['Subtitles'],
  summary: 'Download Subtitle File',
  description: 'Download the exact subtitle file matched to video filename with quota enforcement.',
  security: [{ bearerAuth: [] }],
  parameters: [
    { name: 'tmdb_id', in: 'query', required: true, schema: { type: 'integer' } },
    { name: 'type', in: 'query', schema: { type: 'string' } },
    { name: 'season', in: 'query', schema: { type: 'integer' } },
    { name: 'episode', in: 'query', schema: { type: 'integer' } },
    { name: 'language', in: 'query', schema: { type: 'string', default: 'en' } },
    { name: 'filename', in: 'query', schema: { type: 'string' } }
  ],
  responses: {
    '200': { description: 'Subtitle file stream' },
    '429': { description: 'Daily subtitle download limit reached' }
  }
});

// 8. Media & Streaming
addPath('/api/webdav/download-zip', 'GET', {
  tags: ['Media & Streaming'],
  summary: 'Download Folder as ZIP Archive',
  description: 'Streams a dynamically generated uncompressed ZIP archive containing all files in the requested directory.',
  security: [{ bearerAuth: [] }],
  parameters: [
    { name: 'path', in: 'query', required: true, schema: { type: 'string' }, description: 'Folder path to zip' },
    { name: 'token', in: 'query', schema: { type: 'string' }, description: 'Optional auth token parameter for direct browser downloads' }
  ],
  responses: {
    '200': {
      description: 'Streaming ZIP file',
      content: { 'application/zip': { schema: { type: 'string', format: 'binary' } } }
    },
    '401': { description: 'Valid account required' }
  }
});

addPath('/api/webdav/download-zip/{filename}', 'GET', {
  tags: ['Media & Streaming'],
  summary: 'Download Folder as ZIP Archive (With Filename)',
  description: 'Alias to download ZIP with explicit filename in URL path.',
  security: [{ bearerAuth: [] }],
  parameters: [
    { name: 'filename', in: 'path', required: true, schema: { type: 'string' } },
    { name: 'path', in: 'query', required: true, schema: { type: 'string' } },
    { name: 'token', in: 'query', schema: { type: 'string' } }
  ],
  responses: {
    '200': { description: 'Streaming ZIP file' }
  }
});

addPath('/api/webdav/status', 'GET', {
  tags: ['Media & Streaming'],
  summary: 'WebDAV Status',
  description: 'Check WebDAV host connectivity.',
  responses: {
    '200': {
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              enabled: { type: 'boolean', example: true },
              host: { type: 'string', example: 'http://openlist:5244/dav' }
            }
          }
        }
      }
    }
  }
});

addPath('/api/image-proxy', 'GET', {
  tags: ['Media & Streaming'],
  summary: 'High-Performance Image Proxy',
  description: 'Fetches and proxies remote image URLs with long-term immutable caching headers.',
  parameters: [
    { name: 'url', in: 'query', required: true, schema: { type: 'string' }, description: 'Remote image URL to proxy' }
  ],
  responses: {
    '200': {
      description: 'Image binary data',
      content: {
        'image/*': { schema: { type: 'string', format: 'binary' } }
      }
    }
  }
});

// 9. Downloads Tracker
addPath('/api/downloads/track', 'POST', {
  tags: ['Downloads'],
  summary: 'Track Download Event',
  description: 'Records a download or stream initiation event for popularity ranking.',
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/DownloadTrackRequest' }
      }
    }
  },
  responses: {
    '200': { description: 'Download event recorded' }
  }
});

addPath('/api/downloads/top', 'GET', {
  tags: ['Downloads'],
  summary: 'Get Top Downloaded Titles',
  description: 'Returns the top 15 most downloaded titles on the server.',
  responses: {
    '200': {
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              topDownloads: { type: 'array', items: { $ref: '#/components/schemas/DownloadItem' } },
              totalTracked: { type: 'integer', example: 128 }
            }
          }
        }
      }
    }
  }
});

addPath('/api/downloads/clear', 'POST', {
  tags: ['Downloads'],
  summary: 'Clear Download Analytics (Admin)',
  security: [{ bearerAuth: [] }],
  responses: {
    '200': { description: 'Analytics cleared' }
  }
});

// 10. User Collections
addPath('/api/user-collections', 'GET', {
  tags: ['User Collections'],
  summary: 'List Collections',
  description: 'List all public user collections and the current user\'s private collections.',
  security: [{ bearerAuth: [] }, { userHeader: [] }],
  responses: {
    '200': {
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              collections: { type: 'array', items: { $ref: '#/components/schemas/UserCollection' } }
            }
          }
        }
      }
    }
  }
});

addPath('/api/user-collections', 'POST', {
  tags: ['User Collections'],
  summary: 'Create Collection',
  description: 'Create a new public or private collection / playlist.',
  security: [{ bearerAuth: [] }, { userHeader: [] }],
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/CreateUserCollectionRequest' }
      }
    }
  },
  responses: {
    '200': { description: 'Collection created' }
  }
});

addPath('/api/user-collections/{id}', 'GET', {
  tags: ['User Collections'],
  summary: 'Get Collection by ID',
  parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
  responses: {
    '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/UserCollection' } } } },
    '404': { description: 'Collection not found' }
  }
});

addPath('/api/user-collections/{id}', 'PUT', {
  tags: ['User Collections'],
  summary: 'Update Collection',
  description: 'Edit collection title, description, items, or visibility (author or admin only).',
  security: [{ bearerAuth: [] }, { userHeader: [] }],
  parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
  requestBody: {
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/UpdateUserCollectionRequest' }
      }
    }
  },
  responses: {
    '200': { description: 'Collection updated' },
    '403': { description: 'Forbidden: only author can modify' }
  }
});

addPath('/api/user-collections/{id}', 'DELETE', {
  tags: ['User Collections'],
  summary: 'Delete Collection',
  security: [{ bearerAuth: [] }, { userHeader: [] }],
  parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
  responses: {
    '200': { description: 'Collection deleted' },
    '403': { description: 'Forbidden: only author can delete' }
  }
});

addPath('/api/user-collections/{id}/upvote', 'POST', {
  tags: ['User Collections'],
  summary: 'Upvote Collection',
  security: [{ bearerAuth: [] }, { userHeader: [] }],
  parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
  responses: {
    '200': { description: 'Upvote recorded' }
  }
});

// 11. Jellyfin
addPath('/api/jellyfin/recently-added', 'GET', {
  tags: ['Jellyfin'],
  summary: 'Recently Added Media',
  description: 'Fetch recently added media items synced from Jellyfin or library scanner.',
  security: [{ bearerAuth: [] }],
  parameters: [
    { name: 'force', in: 'query', schema: { type: 'boolean' }, description: 'Force metadata cache bump' }
  ],
  responses: {
    '200': { description: 'List of recently added media' }
  }
});

addPath('/api/jellyfin/override', 'POST', {
  tags: ['Jellyfin'],
  summary: 'Set Jellyfin Path Override (Admin)',
  security: [{ bearerAuth: [] }],
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: ['jfName'],
          properties: {
            jfName: { type: 'string' },
            openlistPath: { type: 'string' },
            category: { type: 'string' },
            year: { type: 'string' }
          }
        }
      }
    }
  },
  responses: {
    '200': { description: 'Override set' }
  }
});

addPath('/api/jellyfin/overrides', 'GET', {
  tags: ['Jellyfin'],
  summary: 'Get All Jellyfin Overrides (Admin)',
  security: [{ bearerAuth: [] }],
  responses: {
    '200': { description: 'Map of Jellyfin path overrides' }
  }
});

// 12. AI & Chat
addPath('/api/chat', 'POST', {
  tags: ['AI & Chat'],
  summary: 'Chat with AI Media Assistant',
  description: 'AI chatbot providing movie, series, and anime recommendations.',
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/ChatRequest' }
      }
    }
  },
  responses: {
    '200': {
      content: { 'application/json': { schema: { $ref: '#/components/schemas/ChatResponse' } } }
    }
  }
});

// 13. Details cache
addPath('/api/details/save', 'POST', {
  tags: ['Metadata'],
  summary: 'Save Details to SQLite Cache',
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: ['fullPath'],
          properties: {
            fullPath: { type: 'string' },
            tmdbData: { type: 'object' },
            baseItems: { type: 'array', items: { type: 'object' } },
            seasonItems: { type: 'object' }
          }
        }
      }
    }
  },
  responses: {
    '200': { description: 'Details cache saved' }
  }
});

addPath('/api/details/preload', 'POST', {
  tags: ['Metadata'],
  summary: 'Preload Details (Deprecated)',
  responses: {
    '200': { description: 'Preload response' }
  }
});

// 14. Configuration
addPath('/api/config', 'GET', {
  tags: ['Configuration'],
  summary: 'Get Server Configuration',
  description: 'Returns server settings, base path, inactivity timeout, and global announcements.',
  responses: {
    '200': {
      content: { 'application/json': { schema: { $ref: '#/components/schemas/AppConfig' } } }
    }
  }
});

addPath('/api/config', 'POST', {
  tags: ['Configuration'],
  summary: 'Update Server Configuration (Admin)',
  security: [{ bearerAuth: [] }],
  requestBody: {
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            openlistUrl: { type: 'string' },
            basePath: { type: 'string' },
            inactivityTimeout: { type: 'integer' },
            announcement: { type: 'string' }
          }
        }
      }
    }
  },
  responses: {
    '200': { description: 'Configuration updated' }
  }
});

// 15. Admin
addPath('/api/users/expirations', 'GET', {
  tags: ['Admin'],
  summary: 'List User Account Expirations (Admin)',
  security: [{ bearerAuth: [] }],
  responses: {
    '200': { description: 'User expiration records map' }
  }
});

addPath('/api/users/expirations', 'POST', {
  tags: ['Admin'],
  summary: 'Set User Expiration (Admin)',
  security: [{ bearerAuth: [] }],
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: ['userId', 'expirationDate'],
          properties: {
            userId: { type: 'string', example: '12' },
            expirationDate: { type: 'string', example: '2026-12-31T23:59:59.000Z' }
          }
        }
      }
    }
  },
  responses: {
    '200': { description: 'Expiration saved' }
  }
});

addPath('/api/users/lockouts', 'GET', {
  tags: ['Admin'],
  summary: 'List User Lockouts (Admin)',
  security: [{ bearerAuth: [] }],
  responses: {
    '200': { description: 'Map of user lockout statuses' }
  }
});

addPath('/api/users/reset-lockout', 'POST', {
  tags: ['Admin'],
  summary: 'Reset User Account Lockout (Admin)',
  security: [{ bearerAuth: [] }],
  requestBody: {
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            username: { type: 'string' },
            userId: { type: 'integer' },
            reEnable: { type: 'boolean' }
          }
        }
      }
    }
  },
  responses: {
    '200': { description: 'Lockout reset' }
  }
});

addPath('/api/users/batch-reset-lockout', 'POST', {
  tags: ['Admin'],
  summary: 'Batch Reset Lockouts (Admin)',
  security: [{ bearerAuth: [] }],
  requestBody: {
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            userIds: { type: 'array', items: { type: 'integer' } },
            usernames: { type: 'array', items: { type: 'string' } },
            reEnable: { type: 'boolean' }
          }
        }
      }
    }
  },
  responses: {
    '200': { description: 'Batch lockout reset completed' }
  }
});

addPath('/api/admin/sessions', 'GET', {
  tags: ['Admin'],
  summary: 'List Active User Sessions (Admin)',
  security: [{ bearerAuth: [] }],
  responses: {
    '200': {
      content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/AdminSessionItem' } } } }
    }
  }
});

addPath('/api/admin/sessions/terminate', 'POST', {
  tags: ['Admin'],
  summary: 'Terminate User Session (Admin)',
  security: [{ bearerAuth: [] }],
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: ['token'],
          properties: {
            token: { type: 'string' }
          }
        }
      }
    }
  },
  responses: {
    '200': { description: 'Session terminated' }
  }
});

addPath('/api/admin/logs', 'GET', {
  tags: ['Admin'],
  summary: 'Get Activity & Audit Logs (Admin)',
  security: [{ bearerAuth: [] }],
  responses: {
    '200': {
      content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/AdminLogItem' } } } }
    }
  }
});

addPath('/api/admin/logs/download', 'GET', {
  tags: ['Admin'],
  summary: 'Download Raw Debug Log (Admin)',
  security: [{ bearerAuth: [] }],
  responses: {
    '200': { description: 'Download app-debug.log file' }
  }
});

addPath('/api/admin/logs/clear-debug', 'POST', {
  tags: ['Admin'],
  summary: 'Clear Debug Log File (Admin)',
  security: [{ bearerAuth: [] }],
  responses: {
    '200': { description: 'Debug log cleared' }
  }
});

addPath('/api/admin/log', 'POST', {
  tags: ['Admin'],
  summary: 'Create Manual Audit Log Entry (Admin)',
  security: [{ bearerAuth: [] }],
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: ['action', 'details'],
          properties: {
            action: { type: 'string' },
            username: { type: 'string' },
            details: { type: 'string' }
          }
        }
      }
    }
  },
  responses: {
    '200': { description: 'Log entry added' }
  }
});

addPath('/api/admin/clear-cache', 'POST', {
  tags: ['Admin'],
  summary: 'Clear All In-Memory Caches (Admin)',
  security: [{ bearerAuth: [] }],
  responses: {
    '200': { description: 'Cache cleared and meta version bumped' }
  }
});

addPath('/api/admin/db/download', 'GET', {
  tags: ['Admin'],
  summary: 'Download SQLite Backup (Admin)',
  security: [{ bearerAuth: [] }],
  responses: {
    '200': { description: 'Binary SQLite database file download' }
  }
});

addPath('/api/admin/diagnostic', 'GET', {
  tags: ['Admin'],
  summary: 'Server & Database Diagnostics (Admin)',
  security: [{ bearerAuth: [] }],
  responses: {
    '200': { description: 'Diagnostic test results' }
  }
});

// Output YAML to /openapi.yaml
const yamlStr = YAML.stringify(doc, 10, 2);
fs.writeFileSync(path.join(process.cwd(), 'openapi.yaml'), yamlStr, 'utf8');
console.log(`Generated openapi.yaml with ${Object.keys(doc.paths).length} endpoints.`);
