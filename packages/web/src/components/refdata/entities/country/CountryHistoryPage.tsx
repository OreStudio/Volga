import type { ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router';
import { EntityHistoryPage, type HistoryVersion } from '../../../../entity/EntityHistoryPage.js';
import { countryMeta } from '../../../../generated/refdata/ui/country_ui.js';
import { useCountryHistory } from '../../../../api/countries.js';
import { useTranslation } from '../../../../i18n/Provider.js';
import { usePageCrumbLabel } from '../../../PageCrumb.js';

/**
 * The history of one country.
 *
 * The versions come from the service already ordered, and the screen is the
 * shared one. What is here is only the mapping from this entity's records to the
 * shape a history is rendered from.
 */
export function CountryHistoryPage(): ReactNode {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const query = useCountryHistory(id);

  // The name the record goes by, taken from its most recent version, so the
  // breadcrumb says Argentina rather than AR.
  const newest = query.data?.versions[0];
  usePageCrumbLabel(newest?.name);

  const versions: readonly HistoryVersion[] = (query.data?.versions ?? []).map((version) => ({
    version: version.version,
    modifiedBy: version.modifiedBy,
    performedBy: version.performedBy,
    recordedAt: version.recordedAt,
    changeReasonCode: version.changeReasonCode,
    changeCommentary: version.changeCommentary,
    values: {
      alpha2_code: version.alpha2Code,
      alpha3_code: version.alpha3Code,
      numeric_code: version.numericCode,
      name: version.name,
      official_name: version.officialName,
      version: version.version,
      modified_by: version.modifiedBy,
      recorded_at: version.recordedAt,
    },
  }));

  return (
    <EntityHistoryPage
      meta={countryMeta}
      /*
       * The record's own name, as the detail screen uses.
       *
       * `country.singular` is deliberately lower case: it exists to sit inside a
       * sentence, as in "Delete country?". Using it as a heading is how the title
       * read "country AD" — a fragment of a sentence and an identifier, in the
       * one place a person looks to see what they are looking at.
       */
      title={newest?.name ?? String(id ?? '')}
      versions={versions}
      loading={query.isPending}
      failed={query.isError}
      onRetry={() => void query.refetch()}
      // Opening a version is reading it, which is a route rather than a mode, so
      // the back button means something.
      onOpenVersion={() => navigate(`/refdata/country/${String(id ?? '')}`)}
    />
  );
}
