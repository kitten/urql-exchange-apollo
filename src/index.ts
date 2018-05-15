import { ApolloLink, execute, FetchResult, GraphQLRequest } from 'apollo-link';
import { DocumentNode } from 'graphql';
import { parse } from 'graphql/language/parser';
import { Observable } from 'zen-observable-ts';

import {
  cacheExchange,
  CombinedError,
  dedupExchange,
  IClient,
  IExchange,
} from 'urql';

const getOperationName = (doc: DocumentNode): string | null => {
  const size = doc.definitions.length;

  for (let i = 0; i < size; i++) {
    const definition = doc.definitions[i];
    if (definition.kind === 'OperationDefinition' && definition.name) {
      return definition.name.value;
    }
  }

  return null;
};

export const apolloLinkExchange = (
  link: ApolloLink
): IExchange => operation => {
  const context = operation.context || {};
  const query: DocumentNode = parse(operation.query);

  const apolloOperation: GraphQLRequest = {
    context: {
      ...context,
      fetchOptions: context.fetchOptions || undefined,
      skipCache: undefined,
      uri: context.url || undefined,
      url: undefined,
    },
    extensions: {},
    operationName: getOperationName(query),
    query: query as any,
    variables: operation.variables,
  };

  return new Observable(observer => {
    let complete = false;

    const sub = execute(link, apolloOperation).subscribe({
      complete: () => {
        if (!complete) {
          observer.complete();
          complete = true;
        }
      },
      error: e => {
        if (Array.isArray(e.graphQLErrors) || e.networkError) {
          observer.error(e);
        } else {
          observer.error(new CombinedError({ networkError: e }));
        }

        complete = true;
      },
      next: (result: FetchResult) => {
        const { errors, data } = result;

        const error = Array.isArray(errors)
          ? new CombinedError({ graphQLErrors: errors })
          : undefined;

        complete = true;

        if (data) {
          observer.next({ data, error });
          observer.complete();
        } else if (error !== undefined) {
          observer.error(error);
        } else {
          observer.error(new Error('no data or error'));
        }
      },
    });

    return () => sub.unsubscribe();
  });
};

const defaultApolloExchange = (link: ApolloLink) => (
  _: IExchange,
  client: IClient
) => cacheExchange(client.cache, dedupExchange(apolloLinkExchange(link)));

export default defaultApolloExchange;
