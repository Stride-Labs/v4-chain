import {
  CandleFromDatabase,
  CandleResolution,
  CandleTable,
  dbHelpers,
  PerpetualMarketFromDatabase,
  perpetualMarketRefresher,
  testConstants,
  testMocks,
} from '@dydxprotocol-indexer/postgres';
import _ from 'lodash';
import { DateTime } from 'luxon';
import request from 'supertest';
import { SPARKLINE_TIME_PERIOD_TO_LIMIT_MAP, SPARKLINE_TIME_PERIOD_TO_RESOLUTION_MAP } from '../../../../src/lib/constants';

import { RequestMethod, SparklineTimePeriod } from '../../../../src/types';
import { sendRequest } from '../../../helpers/helpers';

describe('sparklines-controller#V4', () => {
  beforeAll(async () => {
    await dbHelpers.migrate();
  });

  beforeEach(async () => {
    await testMocks.seedData();
    await perpetualMarketRefresher.updatePerpetualMarkets();
  });

  afterEach(async () => {
    await dbHelpers.clearData();
  });

  afterAll(async () => {
    await dbHelpers.teardown();
  });

  describe('/v4/sparklines', () => {
    it('successfully returns no sparklines if no candles exist', async () => {
      const response: request.Response = await sendRequest({
        type: RequestMethod.GET,
        path: '/v4/sparklines?timePeriod=ONE_DAY',
      });

      expect(response.body).toEqual({
        [testConstants.defaultPerpetualMarket.ticker]: [],
        [testConstants.defaultPerpetualMarket2.ticker]: [],
      });
    });

    it.each(
      _.map(Object.values(SparklineTimePeriod), (timePeriod: SparklineTimePeriod) => [timePeriod]),
    )('successfully returns time period %s sparklines', async (timePeriod: SparklineTimePeriod) => {
      const resolutionToClosePriceMap: Record<CandleResolution, string> = {
        [CandleResolution.ONE_DAY]: Math.floor(Math.random() * 20000).toString(),
        [CandleResolution.FOUR_HOURS]: Math.floor(Math.random() * 20000).toString(),
        [CandleResolution.ONE_HOUR]: Math.floor(Math.random() * 20000).toString(),
        [CandleResolution.THIRTY_MINUTES]: Math.floor(Math.random() * 20000).toString(),
        [CandleResolution.FIFTEEN_MINUTES]: Math.floor(Math.random() * 20000).toString(),
        [CandleResolution.FIVE_MINUTES]: Math.floor(Math.random() * 20000).toString(),
        [CandleResolution.ONE_MINUTE]: Math.floor(Math.random() * 20000).toString(),
      };

      await Promise.all(
        // eslint-disable-next-line @typescript-eslint/require-await
        _.flatten(
          _.map(
            [testConstants.defaultPerpetualMarket, testConstants.defaultPerpetualMarket2],
            (perpetualMarket: PerpetualMarketFromDatabase): Promise<CandleFromDatabase>[] => {
              return _.map(
                Object.values(CandleResolution),
                // eslint-disable-next-line @typescript-eslint/require-await
                async (res: CandleResolution): Promise<CandleFromDatabase> => {
                  return CandleTable.create({
                    ...testConstants.defaultCandle,
                    ticker: perpetualMarket.ticker,
                    resolution: res,
                    close: resolutionToClosePriceMap[res],
                  });
                },
              );
            },
          ),
        ),
      );

      const response: request.Response = await sendRequest({
        type: RequestMethod.GET,
        path: `/v4/sparklines?timePeriod=${timePeriod}`,
      });

      const resolution: CandleResolution = SPARKLINE_TIME_PERIOD_TO_RESOLUTION_MAP[timePeriod];
      expect(response.body).toEqual({
        [testConstants.defaultPerpetualMarket.ticker]: [
          resolutionToClosePriceMap[resolution],
        ],
        [testConstants.defaultPerpetualMarket2.ticker]: [
          resolutionToClosePriceMap[resolution],
        ],
      });
    });

    it('successfully returns a sparkline for a time period', async () => {
      const defaultTimePeriod: SparklineTimePeriod = SparklineTimePeriod.ONE_DAY;
      const resolution:
      CandleResolution = SPARKLINE_TIME_PERIOD_TO_RESOLUTION_MAP[defaultTimePeriod];
      const closePrices: string[] = [];
      await Promise.all(
        // eslint-disable-next-line @typescript-eslint/require-await
        _.times(100, async (i: number) => {
          const close = Math.floor(Math.random() * 20000).toString();
          closePrices.push(close);
          return CandleTable.create({
            ...testConstants.defaultCandle,
            resolution,
            close,
            startedAt: DateTime.fromISO(testConstants.defaultCandle.startedAt).minus(i).toISO(),
          });
        }),
      );

      const response: request.Response = await sendRequest({
        type: RequestMethod.GET,
        path: `/v4/sparklines?timePeriod=${defaultTimePeriod}`,
      });

      const limit: number = SPARKLINE_TIME_PERIOD_TO_LIMIT_MAP[defaultTimePeriod];
      expect(response.body).toEqual({
        [testConstants.defaultPerpetualMarket.ticker]: _.times(
          limit,
          (i: number) => closePrices[i],
        ),
        [testConstants.defaultPerpetualMarket2.ticker]: [],
      });
    });

    it('successfully returns multiple sparklines when one sparkline has less than "limit" candles',
      async () => {
        const timePeriod: SparklineTimePeriod = SparklineTimePeriod.ONE_DAY;
        const resolution: CandleResolution = SPARKLINE_TIME_PERIOD_TO_RESOLUTION_MAP[timePeriod];
        const limit: number = SPARKLINE_TIME_PERIOD_TO_LIMIT_MAP[timePeriod];
        const firstClosing: string = Math.floor(Math.random() * 20000).toString();

        await Promise.all(
          _.times(limit, (i: number) => {
            return CandleTable.create({
              ...testConstants.defaultCandle,
              startedAt: DateTime
                .fromISO(testConstants.defaultCandle.startedAt)
                .minus({ hour: i })
                .toISO(),
              ticker: testConstants.defaultPerpetualMarket.ticker,
              resolution,
              close: firstClosing,
            });
          }),
        );

        const secondClosing: string = Math.floor(Math.random() * 20000).toString();

        const limit2: number = limit - 10;
        await Promise.all(
          _.times(limit2, (i: number) => {
            return CandleTable.create({
              ...testConstants.defaultCandle,
              startedAt: DateTime
                .fromISO(testConstants.defaultCandle.startedAt)
                .minus({ hour: i })
                .toISO(),
              ticker: testConstants.defaultPerpetualMarket2.ticker,
              resolution,
              close: secondClosing,
            });
          }),
        );

        const response: request.Response = await sendRequest({
          type: RequestMethod.GET,
          path: `/v4/sparklines?timePeriod=${timePeriod}`,
        });

        expect(response.body).toEqual({
          [testConstants.defaultPerpetualMarket.ticker]: _.times(limit, () => firstClosing),
          [testConstants.defaultPerpetualMarket2.ticker]: _.times(limit2, () => secondClosing),
        });
      },
    );
  });
});