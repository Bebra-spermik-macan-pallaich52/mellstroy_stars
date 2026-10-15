'use strict';

// Source rectangles measured from the alpha channel of the generated sheets.
// Rows: down, left, right, up. Four walking phases per row; column 0 is idle.
// Each figure is drawn at one shared scale and anchored at bottom-center.
// Rectangles include up to 4 px of anti-aliasing margin around one complete figure.
const spriteManifest = {
  "arthur": {
    "image": "assets/characters/arthur-walk.png",
    "sheetSize": {
      "width": 1254,
      "height": 1254
    },
    "frameSize": {
      "width": 152,
      "height": 307
    },
    "frames": [
      {
        "x": 84,
        "y": 8,
        "width": 134,
        "height": 299
      },
      {
        "x": 404,
        "y": 8,
        "width": 135,
        "height": 302
      },
      {
        "x": 696,
        "y": 12,
        "width": 152,
        "height": 296
      },
      {
        "x": 1036,
        "y": 11,
        "width": 133,
        "height": 300
      },
      {
        "x": 88,
        "y": 318,
        "width": 129,
        "height": 301
      },
      {
        "x": 399,
        "y": 317,
        "width": 144,
        "height": 302
      },
      {
        "x": 711,
        "y": 318,
        "width": 147,
        "height": 300
      },
      {
        "x": 1035,
        "y": 317,
        "width": 146,
        "height": 301
      },
      {
        "x": 87,
        "y": 627,
        "width": 137,
        "height": 307
      },
      {
        "x": 401,
        "y": 627,
        "width": 147,
        "height": 305
      },
      {
        "x": 706,
        "y": 629,
        "width": 152,
        "height": 303
      },
      {
        "x": 1035,
        "y": 627,
        "width": 151,
        "height": 305
      },
      {
        "x": 85,
        "y": 942,
        "width": 133,
        "height": 285
      },
      {
        "x": 401,
        "y": 941,
        "width": 135,
        "height": 294
      },
      {
        "x": 707,
        "y": 942,
        "width": 148,
        "height": 290
      },
      {
        "x": 1039,
        "y": 944,
        "width": 140,
        "height": 289
      }
    ]
  },
  "kotost": {
    "image": "assets/characters/kotost-walk.png",
    "sheetSize": {
      "width": 1254,
      "height": 1254
    },
    "frameSize": {
      "width": 276,
      "height": 264
    },
    "frames": [
      {
        "x": 37,
        "y": 53,
        "width": 250,
        "height": 248
      },
      {
        "x": 350,
        "y": 51,
        "width": 250,
        "height": 253
      },
      {
        "x": 663,
        "y": 51,
        "width": 252,
        "height": 256
      },
      {
        "x": 980,
        "y": 49,
        "width": 244,
        "height": 259
      },
      {
        "x": 38,
        "y": 353,
        "width": 260,
        "height": 244
      },
      {
        "x": 342,
        "y": 353,
        "width": 271,
        "height": 241
      },
      {
        "x": 653,
        "y": 353,
        "width": 272,
        "height": 242
      },
      {
        "x": 967,
        "y": 353,
        "width": 267,
        "height": 241
      },
      {
        "x": 23,
        "y": 649,
        "width": 273,
        "height": 246
      },
      {
        "x": 338,
        "y": 646,
        "width": 273,
        "height": 248
      },
      {
        "x": 647,
        "y": 647,
        "width": 276,
        "height": 248
      },
      {
        "x": 959,
        "y": 646,
        "width": 273,
        "height": 247
      },
      {
        "x": 39,
        "y": 943,
        "width": 248,
        "height": 260
      },
      {
        "x": 351,
        "y": 943,
        "width": 250,
        "height": 264
      },
      {
        "x": 663,
        "y": 943,
        "width": 251,
        "height": 264
      },
      {
        "x": 980,
        "y": 945,
        "width": 246,
        "height": 262
      }
    ]
  },
  "mellstroy_fat": {
    "image": "assets/characters/mellstroy_fat-walk.png",
    "sheetSize": {
      "width": 1254,
      "height": 1254
    },
    "frameSize": {
      "width": 192,
      "height": 282
    },
    "frames": [
      {
        "x": 82,
        "y": 31,
        "width": 187,
        "height": 279
      },
      {
        "x": 384,
        "y": 33,
        "width": 189,
        "height": 277
      },
      {
        "x": 688,
        "y": 35,
        "width": 183,
        "height": 275
      },
      {
        "x": 998,
        "y": 38,
        "width": 177,
        "height": 272
      },
      {
        "x": 114,
        "y": 336,
        "width": 126,
        "height": 280
      },
      {
        "x": 390,
        "y": 339,
        "width": 185,
        "height": 277
      },
      {
        "x": 707,
        "y": 338,
        "width": 165,
        "height": 276
      },
      {
        "x": 1008,
        "y": 336,
        "width": 176,
        "height": 280
      },
      {
        "x": 97,
        "y": 638,
        "width": 130,
        "height": 281
      },
      {
        "x": 373,
        "y": 638,
        "width": 187,
        "height": 281
      },
      {
        "x": 694,
        "y": 638,
        "width": 166,
        "height": 273
      },
      {
        "x": 1008,
        "y": 637,
        "width": 168,
        "height": 282
      },
      {
        "x": 86,
        "y": 942,
        "width": 187,
        "height": 274
      },
      {
        "x": 381,
        "y": 940,
        "width": 192,
        "height": 278
      },
      {
        "x": 688,
        "y": 941,
        "width": 191,
        "height": 277
      },
      {
        "x": 997,
        "y": 942,
        "width": 189,
        "height": 276
      }
    ]
  },
  "dark_drun": {
    "image": "assets/characters/dark_drun-walk.png",
    "sheetSize": {
      "width": 1254,
      "height": 1254
    },
    "frameSize": {
      "width": 207,
      "height": 287
    },
    "frames": [
      {
        "x": 67,
        "y": 28,
        "width": 195,
        "height": 266
      },
      {
        "x": 375,
        "y": 28,
        "width": 193,
        "height": 270
      },
      {
        "x": 686,
        "y": 28,
        "width": 194,
        "height": 268
      },
      {
        "x": 991,
        "y": 28,
        "width": 199,
        "height": 269
      },
      {
        "x": 97,
        "y": 326,
        "width": 138,
        "height": 284
      },
      {
        "x": 402,
        "y": 324,
        "width": 165,
        "height": 287
      },
      {
        "x": 712,
        "y": 328,
        "width": 152,
        "height": 281
      },
      {
        "x": 1025,
        "y": 326,
        "width": 158,
        "height": 284
      },
      {
        "x": 84,
        "y": 635,
        "width": 144,
        "height": 285
      },
      {
        "x": 388,
        "y": 636,
        "width": 165,
        "height": 278
      },
      {
        "x": 692,
        "y": 635,
        "width": 174,
        "height": 284
      },
      {
        "x": 1010,
        "y": 634,
        "width": 171,
        "height": 285
      },
      {
        "x": 59,
        "y": 951,
        "width": 207,
        "height": 264
      },
      {
        "x": 370,
        "y": 944,
        "width": 197,
        "height": 273
      },
      {
        "x": 687,
        "y": 946,
        "width": 195,
        "height": 270
      },
      {
        "x": 996,
        "y": 943,
        "width": 199,
        "height": 273
      }
    ]
  },
  "fog": {
    "image": "assets/characters/fog-walk.png",
    "sheetSize": {
      "width": 1254,
      "height": 1254
    },
    "frameSize": {
      "width": 166,
      "height": 280
    },
    "frames": [
      {
        "x": 126,
        "y": 23,
        "width": 135,
        "height": 267
      },
      {
        "x": 412,
        "y": 22,
        "width": 150,
        "height": 271
      },
      {
        "x": 711,
        "y": 24,
        "width": 133,
        "height": 271
      },
      {
        "x": 989,
        "y": 23,
        "width": 150,
        "height": 271
      },
      {
        "x": 126,
        "y": 326,
        "width": 131,
        "height": 274
      },
      {
        "x": 417,
        "y": 325,
        "width": 147,
        "height": 276
      },
      {
        "x": 713,
        "y": 324,
        "width": 136,
        "height": 278
      },
      {
        "x": 1008,
        "y": 325,
        "width": 140,
        "height": 276
      },
      {
        "x": 118,
        "y": 636,
        "width": 139,
        "height": 271
      },
      {
        "x": 410,
        "y": 634,
        "width": 152,
        "height": 279
      },
      {
        "x": 705,
        "y": 632,
        "width": 140,
        "height": 280
      },
      {
        "x": 997,
        "y": 634,
        "width": 148,
        "height": 278
      },
      {
        "x": 112,
        "y": 940,
        "width": 137,
        "height": 274
      },
      {
        "x": 403,
        "y": 940,
        "width": 158,
        "height": 275
      },
      {
        "x": 697,
        "y": 940,
        "width": 147,
        "height": 276
      },
      {
        "x": 987,
        "y": 940,
        "width": 166,
        "height": 276
      }
    ]
  },
  "chekunets": {
    "image": "assets/characters/chekunets-walk.png",
    "sheetSize": {
      "width": 1254,
      "height": 1254
    },
    "frameSize": {
      "width": 235,
      "height": 307
    },
    "frames": [
      {
        "x": 74,
        "y": 4,
        "width": 214,
        "height": 298
      },
      {
        "x": 390,
        "y": 3,
        "width": 206,
        "height": 305
      },
      {
        "x": 678,
        "y": 3,
        "width": 204,
        "height": 306
      },
      {
        "x": 968,
        "y": 3,
        "width": 215,
        "height": 305
      },
      {
        "x": 104,
        "y": 312,
        "width": 157,
        "height": 306
      },
      {
        "x": 383,
        "y": 310,
        "width": 212,
        "height": 306
      },
      {
        "x": 705,
        "y": 312,
        "width": 182,
        "height": 305
      },
      {
        "x": 983,
        "y": 312,
        "width": 187,
        "height": 305
      },
      {
        "x": 85,
        "y": 618,
        "width": 172,
        "height": 304
      },
      {
        "x": 383,
        "y": 615,
        "width": 202,
        "height": 306
      },
      {
        "x": 689,
        "y": 616,
        "width": 187,
        "height": 306
      },
      {
        "x": 993,
        "y": 619,
        "width": 181,
        "height": 303
      },
      {
        "x": 61,
        "y": 920,
        "width": 226,
        "height": 297
      },
      {
        "x": 374,
        "y": 920,
        "width": 212,
        "height": 307
      },
      {
        "x": 662,
        "y": 921,
        "width": 224,
        "height": 305
      },
      {
        "x": 959,
        "y": 922,
        "width": 235,
        "height": 304
      }
    ]
  },
  "hare": {
    "image": "assets/characters/hare-walk.png",
    "sheetSize": {
      "width": 1254,
      "height": 1254
    },
    "frameSize": {
      "width": 271,
      "height": 301
    },
    "frames": [
      {
        "x": 75,
        "y": 7,
        "width": 255,
        "height": 298
      },
      {
        "x": 360,
        "y": 8,
        "width": 253,
        "height": 298
      },
      {
        "x": 640,
        "y": 7,
        "width": 257,
        "height": 300
      },
      {
        "x": 928,
        "y": 6,
        "width": 255,
        "height": 301
      },
      {
        "x": 90,
        "y": 316,
        "width": 252,
        "height": 297
      },
      {
        "x": 369,
        "y": 317,
        "width": 252,
        "height": 299
      },
      {
        "x": 637,
        "y": 317,
        "width": 267,
        "height": 297
      },
      {
        "x": 928,
        "y": 314,
        "width": 268,
        "height": 300
      },
      {
        "x": 56,
        "y": 621,
        "width": 257,
        "height": 292
      },
      {
        "x": 348,
        "y": 624,
        "width": 257,
        "height": 288
      },
      {
        "x": 630,
        "y": 623,
        "width": 264,
        "height": 291
      },
      {
        "x": 914,
        "y": 623,
        "width": 271,
        "height": 291
      },
      {
        "x": 66,
        "y": 920,
        "width": 268,
        "height": 295
      },
      {
        "x": 358,
        "y": 920,
        "width": 266,
        "height": 293
      },
      {
        "x": 633,
        "y": 920,
        "width": 271,
        "height": 301
      },
      {
        "x": 925,
        "y": 919,
        "width": 266,
        "height": 298
      }
    ]
  },
  "mytost": {
    "image": "assets/characters/mytost-walk.png",
    "sheetSize": {
      "width": 1254,
      "height": 1254
    },
    "frameSize": {
      "width": 251,
      "height": 296
    },
    "frames": [
      {
        "x": 40,
        "y": 17,
        "width": 236,
        "height": 291
      },
      {
        "x": 349,
        "y": 17,
        "width": 249,
        "height": 291
      },
      {
        "x": 665,
        "y": 16,
        "width": 242,
        "height": 294
      },
      {
        "x": 974,
        "y": 16,
        "width": 244,
        "height": 296
      },
      {
        "x": 44,
        "y": 326,
        "width": 227,
        "height": 285
      },
      {
        "x": 352,
        "y": 324,
        "width": 236,
        "height": 285
      },
      {
        "x": 671,
        "y": 324,
        "width": 228,
        "height": 287
      },
      {
        "x": 989,
        "y": 325,
        "width": 226,
        "height": 286
      },
      {
        "x": 43,
        "y": 626,
        "width": 221,
        "height": 284
      },
      {
        "x": 354,
        "y": 626,
        "width": 233,
        "height": 284
      },
      {
        "x": 670,
        "y": 626,
        "width": 228,
        "height": 285
      },
      {
        "x": 982,
        "y": 626,
        "width": 230,
        "height": 284
      },
      {
        "x": 37,
        "y": 922,
        "width": 243,
        "height": 292
      },
      {
        "x": 348,
        "y": 920,
        "width": 248,
        "height": 295
      },
      {
        "x": 659,
        "y": 920,
        "width": 251,
        "height": 296
      },
      {
        "x": 975,
        "y": 920,
        "width": 246,
        "height": 296
      }
    ]
  }
};
