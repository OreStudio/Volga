import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { EntityListPage } from '../../../../entity/EntityListPage.js';
import { useCountries } from '../../../../api/countries.js';
import { countryMeta } from './country_ui.js';
import { useTranslation } from '../../../../i18n/Provider.js';

/**
 * The country list.
 *
 * The whole screen is the shared list plus a declaration. There is no table here,
 * no paging control, no search box and no state machine, which is the test that
 * the shared pieces are doing their job.
 */
export function CountryListPage(): ReactNode {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);

  const query = useCountries({ page, pageSize });

  return (
    <EntityListPage
      meta={countryMeta}
      title={t('country.title')}
      description={t('country.description')}
      rows={query.data?.rows ?? []}
      totalCount={query.data?.totalCount ?? 0}
      query={query}
      page={page}
      pageSize={pageSize}
      // Changing the page size resets to the first page, because the page you
      // were on may not exist at the new size.
      onPageChange={setPage}
      onPageSizeChange={(size) => {
        setPageSize(size);
        setPage(1);
      }}
      onReload={() => void query.refetch()}
      onOpen={(row) => navigate(`/refdata/country/${String(row['id'] ?? '')}`)}
      searchFields={['alpha2_code', 'alpha3_code', 'numeric_code', 'name', 'official_name']}
      searchPlaceholderKey="country.searchPlaceholder"
    />
  );
}
