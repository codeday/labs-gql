import { GraphQLJSONObject } from "graphql-type-json";
import { Query, Resolver } from "type-graphql";
import { TIMEZONE_FRIENDLY_NAMES } from "../utils";
import { Service } from "typedi";

@Service()
@Resolver()
export class TimezoneResolver {
  @Query(() => GraphQLJSONObject)
  supportedTimezones(): Promise<Record<string, string>> {
    return TIMEZONE_FRIENDLY_NAMES;
  }
}