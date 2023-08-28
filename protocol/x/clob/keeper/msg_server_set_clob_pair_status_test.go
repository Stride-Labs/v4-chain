package keeper_test

import (
	"fmt"
	"testing"

	"github.com/cosmos/cosmos-sdk/codec"
	codectypes "github.com/cosmos/cosmos-sdk/codec/types"
	"github.com/cosmos/cosmos-sdk/store/prefix"
	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/dydxprotocol/v4-chain/protocol/mocks"
	"github.com/dydxprotocol/v4-chain/protocol/testutil/constants"
	keepertest "github.com/dydxprotocol/v4-chain/protocol/testutil/keeper"
	"github.com/dydxprotocol/v4-chain/protocol/x/clob/keeper"
	"github.com/dydxprotocol/v4-chain/protocol/x/clob/memclob"
	"github.com/dydxprotocol/v4-chain/protocol/x/clob/types"
	"github.com/dydxprotocol/v4-chain/protocol/x/perpetuals"
	"github.com/dydxprotocol/v4-chain/protocol/x/prices"
	"github.com/stretchr/testify/require"
)

func TestMsgServerSetClobPairStatus(t *testing.T) {
	tests := map[string]struct {
		testMsg        types.MsgSetClobPairStatus
		setup          func(ks keepertest.ClobKeepersTestContext)
		expectedResp   *types.MsgSetClobPairStatusResponse
		getExpectedErr func(ks keepertest.ClobKeepersTestContext) string
		expectedPanic  string
	}{
		"Success": {
			testMsg: types.MsgSetClobPairStatus{
				ClobPairId:     0,
				ClobPairStatus: types.ClobPairStatus_ACTIVE,
			},
			setup: func(ks keepertest.ClobKeepersTestContext) {
				registry := codectypes.NewInterfaceRegistry()
				cdc := codec.NewProtoCodec(registry)
				store := prefix.NewStore(ks.Ctx.KVStore(ks.StoreKey), types.KeyPrefix(types.ClobPairKeyPrefix))
				// Write clob pair to state with clob pair id 0 and status initializing.
				clobPair := constants.ClobPair_Btc
				clobPair.Status = types.ClobPairStatus_INITIALIZING
				b := cdc.MustMarshal(&clobPair)
				store.Set(types.ClobPairKey(
					types.ClobPairId(constants.ClobPair_Btc.Id),
				), b)
			},
			expectedResp: &types.MsgSetClobPairStatusResponse{},
			getExpectedErr: func(ks keepertest.ClobKeepersTestContext) string {
				return ""
			},
		},
		"Panic: clob pair not found": {
			testMsg: types.MsgSetClobPairStatus{
				ClobPairId:     0,
				ClobPairStatus: types.ClobPairStatus_ACTIVE,
			},
			expectedPanic: "mustGetClobPair: ClobPair with id 0 not found",
		},
		"Error: invalid authority": {
			testMsg: types.MsgSetClobPairStatus{
				Authority:      "12345",
				ClobPairId:     0,
				ClobPairStatus: types.ClobPairStatus_ACTIVE,
			},
			setup: func(ks keepertest.ClobKeepersTestContext) {
				// write default btc clob pair to state
				registry := codectypes.NewInterfaceRegistry()
				cdc := codec.NewProtoCodec(registry)
				store := prefix.NewStore(ks.Ctx.KVStore(ks.StoreKey), types.KeyPrefix(types.ClobPairKeyPrefix))
				// Write clob pair to state with clob pair id 0 and status initializing.
				b := cdc.MustMarshal(&constants.ClobPair_Btc)
				store.Set(types.ClobPairKey(
					types.ClobPairId(constants.ClobPair_Btc.Id),
				), b)
			},
			getExpectedErr: func(ks keepertest.ClobKeepersTestContext) string {
				return fmt.Sprintf(
					"invalid authority: expected %s, got %s",
					ks.ClobKeeper.GetGovAuthority(),
					"12345",
				)
			},
		},
	}

	for name, tc := range tests {
		t.Run(name, func(t *testing.T) {
			memClob := memclob.NewMemClobPriceTimePriority(false)
			ks := keepertest.NewClobKeepersTestContext(t, memClob, &mocks.BankKeeper{}, &mocks.IndexerEventManager{})
			prices.InitGenesis(ks.Ctx, *ks.PricesKeeper, constants.Prices_DefaultGenesisState)
			perpetuals.InitGenesis(ks.Ctx, *ks.PerpetualsKeeper, constants.Perpetuals_DefaultGenesisState)

			if tc.setup != nil {
				tc.setup(ks)
			}

			k := ks.ClobKeeper
			msgServer := keeper.NewMsgServerImpl(k)
			wrappedCtx := sdk.WrapSDKContext(ks.Ctx)

			if tc.expectedPanic != "" {
				require.PanicsWithValue(t, tc.expectedPanic, func() {
					_, err := msgServer.SetClobPairStatus(wrappedCtx, &tc.testMsg)
					require.NoError(t, err)
				})
			} else {
				resp, err := msgServer.SetClobPairStatus(wrappedCtx, &tc.testMsg)
				require.Equal(t, tc.expectedResp, resp)

				expectedErr := tc.getExpectedErr(ks)
				if expectedErr != "" {
					require.ErrorContains(t, err, expectedErr)
				} else {
					require.NoError(t, err)
				}
			}
		})
	}
}