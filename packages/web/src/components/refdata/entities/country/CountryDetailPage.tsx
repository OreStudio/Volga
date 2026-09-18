import type { ReactNode } from 'react';
import { useParams } from 'react-router';
import { EntityDetailPage } from '../../../../entity/EntityDetailPage.js';
import { countryMeta } from './country_ui.js';
import { countryFieldGroups } from './country_field_groups.js';
import { useCountries } from '../../../../api/countries.js';
import { useTranslation } from '../../../../i18n/Provider.js';
import type { CountryRow } from '../../../../api/countries.js';

/**
 * Reading one country.
 *
 * The record comes from the list query's cache rather than a second request,
 * because the list has already fetched the page it came from. A record reached by
 * a deep link with no cache falls back to the first page, which finds it.
 */
export function CountryDetailPage(): ReactNode {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  // The list is already fetched and cached, so the detail reads from it rather
  // than issuing a second request. A deep link finds the record on the first
  // page, which is large enough for a reference-data set.
  const query = useCountries({ page: 1, pageSize: 500 });
  const country = query.data?.rows.find((row) => row['id'] === id);

  if (query.isSuccess && country === undefined) {
    return (
      <div className="mx-auto max-w-[680px] px-5 py-16 text-center">
        <h1 className="text-lg font-semibold tracking-tight">{id}</h1>
        <p className="mt-2 text-sm text-ink-muted">{t('feedback.notFound')}</p>
      </div>
    );
  }

  return (
    <EntityDetailPage<CountryRow>
      meta={countryMeta}
      groups={countryFieldGroups}
      row={country}
      mode="read"
      load={(row) => row}
      displayName={(row) => `${String(row['name'] ?? '')} (${String(row['alpha2_code'] ?? '')})`}
    />
  );
}
