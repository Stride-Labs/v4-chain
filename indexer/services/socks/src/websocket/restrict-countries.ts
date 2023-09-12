import { stats } from '@dydxprotocol-indexer/base';

import config from '../config';
import { IncomingMessage } from '../types';

export class CountryRestrictor {
  private restrictedCountries: Set<string>;

  constructor(
    restrictedCountriesConfig: string,
  ) {
    this.restrictedCountries = new Set(restrictedCountriesConfig.split(','));
  }

  public isRestrictedCountry(req: IncomingMessage): boolean {
    const {
      'cf-ipcountry': ipCountry,
    } = req.headers as {
      'cf-ipcountry'?: string,
    };

    if (
      ipCountry !== undefined &&
      this.restrictedCountries.has(ipCountry)
    ) {
      stats.increment(
        `${config.SERVICE_NAME}.rejected_restricted_country_connection`,
        1,
        undefined,
        {
          country: ipCountry,
        },
      );
      return true;
    }

    return false;
  }
}