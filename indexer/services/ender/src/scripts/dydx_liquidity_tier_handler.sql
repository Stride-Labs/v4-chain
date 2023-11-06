/**
  Parameters:
    - event_data: The 'data' field of the IndexerTendermintEvent (https://github.com/dydxprotocol/v4-proto/blob/8d35c86/dydxprotocol/indexer/indexer_manager/event.proto#L25)
        converted to JSON format. Conversion to JSON is expected to be done by JSON.stringify.
  Returns: JSON object containing fields:
    - liquidy_tier: The upserted liquidity tier in liquidity-tiers-model format (https://github.com/dydxprotocol/indexer/blob/cc70982/packages/postgres/src/models/liquidity-tiers-model.ts).
*/
CREATE OR REPLACE FUNCTION dydx_liquidity_tier_handler(event_data jsonb) RETURNS jsonb AS $$
DECLARE
    liquidity_tier_record liquidity_tiers%ROWTYPE;
BEGIN
    liquidity_tier_record."id" = (event_data->'id')::integer;
    liquidity_tier_record."name" = event_data->>'name';
    liquidity_tier_record."initialMarginPpm" = (event_data->'initialMarginPpm')::bigint;
    liquidity_tier_record."maintenanceFractionPpm" = (event_data->'maintenanceFractionPpm')::bigint;
    liquidity_tier_record."basePositionNotional" = power(10, -6) * dydx_from_jsonlib_long(event_data->'basePositionNotional');

    INSERT INTO liquidity_tiers
    VALUES (liquidity_tier_record.*)
    ON CONFLICT ("id") DO
        UPDATE
        SET
            "name" = liquidity_tier_record."name",
            "initialMarginPpm" = liquidity_tier_record."initialMarginPpm",
            "maintenanceFractionPpm" = liquidity_tier_record."maintenanceFractionPpm",
            "basePositionNotional" = liquidity_tier_record."basePositionNotional"
    RETURNING * INTO liquidity_tier_record;

    RETURN jsonb_build_object(
        'liquidity_tier',
        dydx_to_jsonb(liquidity_tier_record)
    );
END;
$$ LANGUAGE plpgsql;